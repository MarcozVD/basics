/** Turn API validation issues into field-level messages for an edit form. */
export function issuesToErrors(issues: unknown): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!Array.isArray(issues)) return errors;
  for (const issue of issues) {
    if (!issue || typeof issue !== "object") continue;
    const { path, message } = issue as { path?: unknown; message?: unknown };
    if (!Array.isArray(path) || path.length === 0 || typeof message !== "string") continue;
    const key = path[0] === "data" && path.length > 1 ? String(path[1]) : String(path[0]);
    errors[key] = message;
  }
  return errors;
}
