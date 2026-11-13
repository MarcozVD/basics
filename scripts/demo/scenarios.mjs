/** Deterministic demo matcher. Count distinct, whole keyword/phrase hits; ties keep file order. */
const words = (text) =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu)
    ?.join(" ") ?? "";
export function matchScenario(input, scenarios) {
  const text = ` ${words(input)} `;
  let winner = null;
  let best = 0;
  for (const scenario of scenarios) {
    const hits = new Set(
      scenario.keywords
        .map(words)
        .filter(Boolean)
        .filter((word) => text.includes(` ${word} `)),
    ).size;
    if (hits > best) {
      winner = scenario;
      best = hits;
    }
  }
  return winner;
}
