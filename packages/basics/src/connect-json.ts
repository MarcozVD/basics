interface Token {
  text: string;
  start: number;
  end: number;
}
interface Property {
  key: string;
  start: number;
  value: JsonNode;
  comma?: Token;
}
interface JsonNode {
  start: number;
  end: number;
  properties?: Property[];
  items?: JsonNode[];
  close?: Token;
}

/** A small JSON/JSONC syntax index. All untouched bytes, including comments, stay in place. */
function syntax(text: string): JsonNode {
  const tokens: Token[] = [];
  let offset = 0;
  while (offset < text.length) {
    const trivia = /^(?:\s+|\/\/[^\r\n]*|\/\*[\s\S]*?\*\/)/.exec(text.slice(offset));
    if (trivia) {
      offset += trivia[0].length;
      continue;
    }
    const match = /^(?:"(?:[^"\\\r\n]|\\.)*"|[{}[\]:,]|true\b|false\b|null\b|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(
      text.slice(offset),
    );
    if (!match) throw new Error("invalid JSON configuration");
    tokens.push({ text: match[0], start: offset, end: offset + match[0].length });
    offset += match[0].length;
  }
  let at = 0;
  const take = (expected?: string): Token => {
    const token = tokens[at++];
    if (!token || (expected && token.text !== expected)) throw new Error("invalid JSON configuration");
    return token;
  };
  const value = (): JsonNode => {
    const token = take();
    if (token.text === "{") {
      const properties: Property[] = [];
      const keys = new Set<string>();
      while (tokens[at]?.text !== "}") {
        const name = take();
        if (!name.text.startsWith('"')) throw new Error("expected a JSON key");
        const key: string = JSON.parse(name.text);
        if (keys.has(key)) throw new Error("duplicate JSON keys require manual editing");
        keys.add(key);
        take(":");
        const child = value();
        const comma = tokens[at]?.text === "," ? take(",") : undefined;
        properties.push({ key, start: name.start, value: child, comma });
        if (!comma) break;
      }
      const close = take("}");
      return { start: token.start, end: close.end, properties, close };
    }
    if (token.text === "[") {
      const items: JsonNode[] = [];
      while (tokens[at]?.text !== "]") {
        items.push(value());
        if (tokens[at]?.text !== ",") break;
        take(",");
      }
      return { start: token.start, end: take("]").end, items };
    }
    JSON.parse(token.text);
    if (/^[}\]:,]$/.test(token.text)) throw new Error("expected a JSON value");
    return { start: token.start, end: token.end };
  };
  const root = value();
  if (at !== tokens.length || !root.properties) throw new Error("expected one JSON object");
  return root;
}

export function readPresetJson(text: string): Record<string, unknown> {
  const root = syntax(text);
  const read = (node: JsonNode): unknown => {
    if (node.properties) return Object.fromEntries(node.properties.map((prop) => [prop.key, read(prop.value)]));
    if (node.items) return node.items.map(read);
    return JSON.parse(text.slice(node.start, node.end));
  };
  return read(root) as Record<string, unknown>;
}

export function patchPresetJson(text: string, keys: string[], desired?: unknown): string {
  if (!text.trim()) text = "{}\n";
  let node = syntax(text);
  let depth = 0;
  for (; depth < keys.length - 1; depth++) {
    const child = node.properties?.find((prop) => prop.key === keys[depth]);
    if (!child) break;
    if (!child.value.properties) throw new Error(`${keys[depth]} must be an object`);
    node = child.value;
  }
  const properties = node.properties ?? [];
  const current = properties.find((prop) => prop.key === keys[depth]);
  if (desired === undefined) {
    if (!current || depth !== keys.length - 1) return text;
    const previous = properties[properties.indexOf(current) - 1];
    const prefixStart = previous?.comma?.end ?? node.start + 1;
    // Insertion adds exactly one newline and indentation before the key. Remove that
    // prefix too, but retain comments or other trivia belonging to existing servers.
    const start = /^\r?\n[\t ]*$/.test(text.slice(prefixStart, current.start)) ? prefixStart : current.start;
    if (!current.comma && previous?.comma) {
      return text.slice(0, previous.comma.start) + text.slice(previous.comma.end, start) + text.slice(current.value.end);
    }
    const end = current.comma?.end ?? current.value.end;
    return text.slice(0, start) + text.slice(end);
  }
  let value = desired;
  for (let i = keys.length - 1; i > depth; i--) value = { [keys[i]]: value };
  const serialized = JSON.stringify(value, null, 2);
  if (current) return text.slice(0, current.value.start) + serialized + text.slice(current.value.end);
  const last = properties.at(-1);
  const insertAt = last?.comma?.end ?? last?.value.end ?? node.start + 1;
  const nl = text.includes("\r\n") ? "\r\n" : "\n";
  const indent = /^([\t ]*)"/m.exec(text.slice(node.start + 1, node.close?.start))?.[1] ?? "  ";
  const addition = `${last && !last.comma ? "," : ""}${nl}${indent}${JSON.stringify(keys[depth])}: ${serialized.replace(/\n/g, `${nl}${indent}`)}${last?.comma ? "," : ""}`;
  return text.slice(0, insertAt) + addition + text.slice(insertAt);
}
