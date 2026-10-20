const AGENT_COLORS = ["#0a84ff", "#30d158", "#ff9f0a", "#bf5af2", "#ff375f", "#8e8e93"];

/** Deterministic avatar color from the note-type palette hues. */
export function agentColor(name: string): string {
  let hash = 0;
  for (let index = 0; index < name.length; index++) {
    hash = (hash * 31 + name.charCodeAt(index)) | 0;
  }
  return AGENT_COLORS[Math.abs(hash) % AGENT_COLORS.length] ?? AGENT_COLORS[0];
}

export function agentInitial(name: string): string {
  const match = name.match(/[a-z0-9]/i);
  return (match?.[0] ?? "?").toUpperCase();
}
