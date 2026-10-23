import zlib from "node:zlib";
import { PackDownloadError } from "./packs.js";

/**
 * Minimal ustar reader for GitHub tarballs (`codeload.github.com/.../tar.gz`).
 * It only materializes regular files; symlinks, hard links, absolute paths and
 * `..` segments are rejected, and size/count/expansion caps are enforced.
 * No runtime dependency beyond `node:zlib`.
 */

export interface TarLimits {
  /** Reject a single regular file larger than this. */
  maxFileBytes: number;
  /** Reject archives with more entries than this. */
  maxEntries: number;
  /** Reject archives whose unpacked size exceeds this. */
  maxUnpackedBytes: number;
}

export interface ParsedTarFile {
  /** Forward-slash relative path inside the archive (top-level dir already stripped). */
  path: string;
  data: Buffer;
}

const BLOCK = 512;

// ustar field offsets (in bytes).
const OFF_NAME = 0;
const OFF_SIZE = 124;
const OFF_TYPEFLAG = 156;
const OFF_LINKNAME = 157;
const OFF_PREFIX = 345;

function readStr(bytes: Uint8Array, start: number, length: number): string {
  let end = start;
  while (end < start + length && bytes[end] !== 0) end++;
  return Buffer.from(bytes.subarray(start, end)).toString("utf8");
}

/** Octal size, with the GNU base-256 fallback newer tars use for big files. */
function readSize(bytes: Uint8Array, start: number, length: number): number {
  if (bytes[start] & 0x80) {
    // base-256: signed big-endian with the 0x80 continuation bit set on the first byte.
    let value = bytes[start] & 0x7f;
    for (let i = 1; i < length; i++) value = value * 256 + bytes[start + i];
    return value;
  }
  let text = "";
  for (let i = 0; i < length; i++) {
    const b = bytes[start + i];
    if (b === 0) break;
    text += String.fromCharCode(b);
  }
  text = text.trim();
  return text === "" ? 0 : Number.parseInt(text, 8);
}

function ratedPath(raw: string): string {
  const normalized = raw.replaceAll("\\", "/");
  if (normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) {
    throw new PackDownloadError(`archive contains an unsafe path: ${raw}`);
  }
  const segments = normalized.split("/");
  for (const segment of segments) {
    if (segment === ".." || segment === ".") throw new PackDownloadError(`archive contains a path with "${segment}": ${raw}`);
  }
  return segments.filter((s) => s.length > 0).join("/");
}

/**
 * Parse a gzip-compressed tar archive. Regular files are returned with the
 * archive's top-level directory stripped. Malformed or unsafe archives throw.
 */
export function parseTarGz(bytes: Buffer, limits: TarLimits): ParsedTarFile[] {
  // Cap the inflated size so a gzip bomb fails before it fills memory; tar headers and
  // block padding add overhead on top of the file bytes, hence the headroom.
  let raw: Buffer;
  try {
    raw = zlib.gunzipSync(bytes, { maxOutputLength: limits.maxUnpackedBytes + (limits.maxEntries + 2) * BLOCK * 3 });
  } catch (err) {
    if (err instanceof RangeError || (err as NodeJS.ErrnoException).code === "ERR_BUFFER_TOO_LARGE") {
      throw new PackDownloadError(`archive unpacks to more than ${limits.maxUnpackedBytes} bytes`);
    }
    throw new PackDownloadError("archive is not a valid gzip file");
  }
  const { files, rootDir } = parseTarRaw(raw, limits);
  if (rootDir === null) return files;
  const prefix = `${rootDir}/`;
  return files
    .map(({ path, data }) => (path.startsWith(prefix) ? { path: path.slice(prefix.length), data } : { path, data }))
    .filter(({ path }) => path.length > 0);
}

/** Parse an uncompressed ustar archive. Entry paths are validated but keep their leading dir. */
export function parseTar(bytes: Buffer, limits: TarLimits): ParsedTarFile[] {
  return parseTarRaw(bytes, limits).files;
}

function parseTarRaw(bytes: Buffer, limits: TarLimits): { files: ParsedTarFile[]; rootDir: string | null } {
  const files: ParsedTarFile[] = [];
  let rootDir: string | null = null;
  let istart = 0;
  let headerCount = 0;
  let unpacked = 0;
  let pendingName: string | undefined; // GNU long name / pax path, applied to the next entry
  let pendingLinkPath: string | undefined;

  while (istart + BLOCK <= bytes.length) {
    const header = bytes.subarray(istart, istart + BLOCK);
    if (header.every((b) => b === 0)) break;
    headerCount += 1;
    if (headerCount > limits.maxEntries) {
      throw new PackDownloadError(`archive has more than ${limits.maxEntries} entries`);
    }

    const rawName = readStr(header, OFF_NAME, 100).replace(/\0+$/, "");
    const prefix = readStr(header, OFF_PREFIX, 155).replace(/\0+$/, "");
    const size = readSize(header, OFF_SIZE, 12);
    const typeflag = String.fromCharCode(header[OFF_TYPEFLAG]);
    const linkname = readStr(header, OFF_LINKNAME, 100);
    const dataStart = istart + BLOCK;
    const data = bytes.subarray(dataStart, dataStart + size);
    if (data.length < size) throw new PackDownloadError("truncated archive");

    if (typeflag === "L") {
      pendingName = readStr(data, 0, data.length).replace(/\0+$/, "").trim();
    } else if (typeflag === "x" || typeflag === "g") {
      // pax extended header: only path/linkpath records matter for us.
      for (const line of readStr(data, 0, data.length).split("\n")) {
        const match = /^\d+ (.+?)(?:=(.*))?$/.exec(line.replace(/\0+$/, ""));
        if (!match) continue;
        const key = match[1];
        const value = match[2] ?? "";
        if (key === "path") pendingName = value;
        else if (key === "linkpath") pendingLinkPath = value;
      }
    } else if (typeflag === "2" || typeflag === "1") {
      throw new PackDownloadError(`archive contains a ${typeflag === "2" ? "symlink" : "hard link"}: ${pendingName ?? rawName}`);
    } else if (typeflag === "0" || typeflag === "\0" || typeflag === "5") {
      const isDir = typeflag === "5";
      const name = (pendingName ?? (prefix ? `${prefix}/${rawName}` : rawName)).replace(/\0+$/, "");
      const target = pendingLinkPath ?? linkname;
      const path = ratedPath(name);
      if (isDir) {
        const segments = path.split("/");
        if (segments.length === 1 && rootDir === null) rootDir = segments[0];
      } else {
        if (size > limits.maxFileBytes) {
          throw new PackDownloadError(`file too large (${size} bytes): ${path}`);
        }
        unpacked += size;
        if (unpacked > limits.maxUnpackedBytes) {
          throw new PackDownloadError(`archive unpacks to more than ${limits.maxUnpackedBytes} bytes`);
        }
        if (target && target !== "N/A") {
          throw new PackDownloadError(`archive references another file from ${path}`);
        }
        files.push({ path, data: Buffer.from(data) });
      }
    }
    if (typeflag !== "L" && typeflag !== "x" && typeflag !== "g") {
      pendingName = undefined;
      pendingLinkPath = undefined;
    }
    istart += BLOCK + Math.ceil(size / BLOCK) * BLOCK;
  }
  return { files, rootDir };
}
