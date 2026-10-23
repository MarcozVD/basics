import zlib from "node:zlib";

/** Minimal ustar archive builder for tests. */
export interface TarEntryInput {
  path: string;
  data?: Buffer | string;
  type?: "file" | "dir" | "symlink" | "hardlink" | "longname" | "pax";
  /** For symlink entries, where it points. */
  linkname?: string;
  /** For GNU long-name entries, the name the *next* entry uses. */
  longName?: string;
  /** For pax entries, the path the *next* entry uses. */
  paxPath?: string;
}

function pad(buf: Buffer, to: number): Buffer {
  const size = Math.ceil(buf.length / to) * to;
  const out = Buffer.alloc(size);
  buf.copy(out);
  return out;
}

function octal(value: number, length: number): Buffer {
  return Buffer.from(value.toString(8).padStart(length, "0").slice(-length), "ascii");
}

function field(value: string, length: number): Buffer {
  const out = Buffer.alloc(length);
  Buffer.from(value, "utf8").copy(out, 0, 0, length);
  return out;
}

function header(
  name: string,
  size: number,
  opts: { type: string; mode?: string; prefix?: string; linkname?: string; uid?: string; gid?: string },
): Buffer {
  const head = Buffer.alloc(512);
  field(name, 100).copy(head, 0);
  field(opts.mode ?? "0000644", 8).copy(head, 100);
  field(opts.uid ?? "0000000", 8).copy(head, 108);
  field(opts.gid ?? "0000000", 8).copy(head, 116);
  octal(size, 12).copy(head, 124);
  octal(0, 12).copy(head, 136);
  field("        ", 8).copy(head, 148); // chksum placeholder (spaces)
  head[156] = opts.type.charCodeAt(0);
  field(opts.linkname ?? "", 100).copy(head, 157);
  field("ustar", 6).copy(head, 257);
  field("00", 2).copy(head, 263);
  if (opts.prefix) field(opts.prefix, 155).copy(head, 345);
  const checksum = head.reduce((sum, byte) => sum + byte, 0);
  field(`${checksum.toString(8).padStart(6, "0")}\0 `, 8).copy(head, 148);
  return head;
}

/** Build an uncompressed tar for the given entries. */
export function buildTar(entries: TarEntryInput[]): Buffer {
  const out: Buffer[] = [];
  for (const entry of entries) {
    if (entry.type === "longname") {
      const data = Buffer.from(`${entry.longName ?? ""}\0`, "utf8");
      out.push(header("PaxHeaders.0/", data.length, { type: "L", mode: "0000000" }));
      out.push(pad(data, 512));
      continue;
    }
    if (entry.type === "pax") {
      const record = Buffer.from(`22 path=${entry.paxPath ?? ""}\n`, "utf8");
      out.push(header("PaxHeaders.0/", record.length, { type: "x", mode: "0000000" }));
      out.push(pad(record, 512));
      continue;
    }
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data ?? "", "utf8");
    const type = entry.type ?? "file";
    const linkname = entry.linkname ?? "";
    // Symlink, hard link and directory entries carry no data block.
    if (type === "symlink") {
      out.push(header(entry.path, 0, { type: "2", mode: "0000777", linkname }));
      continue;
    }
    if (type === "hardlink") {
      out.push(header(entry.path, 0, { type: "1", mode: "0000644", linkname }));
      continue;
    }
    if (type === "dir") {
      const name = entry.path.endsWith("/") ? entry.path : `${entry.path}/`;
      out.push(header(name, 0, { type: "5", mode: "0000755" }));
      continue;
    }
    out.push(header(entry.path, data.length, { type: "0", mode: "0000644" }));
    out.push(pad(data, 512));
  }
  // Two zero blocks terminate the archive.
  out.push(Buffer.alloc(1024));
  return Buffer.concat(out);
}

/** Build a gzipped tar archive. */
export function buildTarGz(entries: TarEntryInput[]): Buffer {
  return zlib.gzipSync(buildTar(entries));
}

/** Standard pack fixture: pack.json + one valid note per language. */
export function fixtureEntries(version = "1.0.0"): TarEntryInput[] {
  return [
    { path: "my-pack", type: "dir" },
    {
      path: "my-pack/pack.json",
      data: JSON.stringify({
        name: "owner/repo-pack",
        version,
        description: { en: "A test community pack", es: "Un pack de prueba" },
        languages: ["en", "es"],
        requires: [],
      }),
    },
    {
      path: "my-pack/notes/en/tech/thing.md",
      data: `---
type: tech
kind: library
title: Thing ${version}
layer: backend
tags: [thing]
---
# Thing ${version}

Community note v${version}.
`,
    },
    {
      path: "my-pack/notes/es/tech/thing.md",
      data: `---
type: tech
kind: library
title: Cosa ${version}
layer: backend
tags: [thing]
---
# Cosa v${version}

Nota comunitaria v${version}.
`,
    },
    { path: "my-pack/README.md", data: "Ignored file that must not become a note.\n" },
  ];
}
