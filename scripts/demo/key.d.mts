/** Stable key for a JSON API request. Strings are parsed as JSON; absent/empty bodies share a key. */
export function snapshotKey(method: string, path: string, body?: unknown): Promise<string>;
