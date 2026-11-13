/** JSON object order is irrelevant; array order remains significant. Shared with the demo fetch shim. */
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
}

/** Key format: uppercase method, normalized path/query, SHA-256 of canonical JSON (or empty body). */
export async function snapshotKey(method, path, body) {
  const url = new URL(path, "https://demo.invalid");
  const pairs = [...url.searchParams].sort(([ak, av], [bk, bv]) => (ak < bk ? -1 : ak > bk ? 1 : av < bv ? -1 : av > bv ? 1 : 0));
  const query = new URLSearchParams(pairs).toString();
  const parsed = typeof body === "string" && body !== "" ? JSON.parse(body) : body;
  const json = parsed === undefined || body === "" ? "" : JSON.stringify(canonical(parsed));
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(json));
  const hex = [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${method.toUpperCase()} ${url.pathname}${query ? `?${query}` : ""} ${hex}`;
}
