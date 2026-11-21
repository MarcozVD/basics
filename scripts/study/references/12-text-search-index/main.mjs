import fs from "node:fs";

const tokens = (text) => text.replace(/[A-Z]/g, (letter) => letter.toLowerCase()).match(/[\p{L}\p{N}]+/gu) ?? [];
try {
  const input = JSON.parse(fs.readFileSync(0, "utf8"));
  if (!input || typeof input !== "object" || Array.isArray(input) || typeof input.query !== "string" || !Array.isArray(input.documents))
    throw new Error("Invalid input");
  const ids = new Set();
  for (const doc of input.documents) {
    if (!doc || typeof doc.id !== "string" || doc.id === "" || typeof doc.text !== "string" || ids.has(doc.id))
      throw new Error("Invalid document");
    ids.add(doc.id);
  }
  const query = [...new Set(tokens(input.query))];
  const results = [];
  for (const doc of input.documents) {
    const counts = new Map();
    for (const token of tokens(doc.text)) counts.set(token, (counts.get(token) ?? 0) + 1);
    const score = query.reduce((sum, token) => sum + (counts.get(token) ?? 0), 0);
    if (score > 0) results.push({ id: doc.id, score });
  }
  results.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  console.log(JSON.stringify({ results }));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
