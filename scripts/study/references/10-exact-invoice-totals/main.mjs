import fs from "node:fs";

const decimals = (currency) => (currency === "JPY" ? 0 : 2);
function toMinor(text, places) {
  const [, sign, whole, fraction = ""] = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text);
  const kept = fraction.slice(0, places).padEnd(places, "0"),
    rest = fraction.slice(places);
  let magnitude = BigInt(whole + kept);
  if (rest) {
    const half = `5${"0".repeat(rest.length - 1)}`;
    if (rest > half || (rest === half && magnitude % 2n === 1n)) magnitude += 1n;
  }
  return sign ? -magnitude : magnitude;
}
function format(minor, places) {
  const negative = minor < 0n,
    digits = (negative ? -minor : minor).toString().padStart(places + 1, "0");
  const text = places ? `${digits.slice(0, -places)}.${digits.slice(-places)}` : digits;
  return negative ? `-${text}` : text;
}
try {
  const rows = JSON.parse(fs.readFileSync(0, "utf8"));
  if (!Array.isArray(rows)) throw new Error("Expected an array");
  const groups = new Map(),
    rejected = [];
  rows.forEach((row, index) => {
    const valid =
      row !== null &&
      typeof row === "object" &&
      typeof row.customer === "string" &&
      row.customer !== "" &&
      typeof row.currency === "string" &&
      /^[A-Z]{3}$/.test(row.currency) &&
      typeof row.amount === "string" &&
      /^-?\d+(\.\d+)?$/.test(row.amount);
    if (!valid) {
      rejected.push(index);
      return;
    }
    const key = JSON.stringify([row.customer, row.currency]),
      group = groups.get(key) ?? { customer: row.customer, currency: row.currency, total: 0n, rows: 0 };
    group.total += toMinor(row.amount, decimals(row.currency));
    group.rows++;
    groups.set(key, group);
  });
  const order = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const list = [...groups.values()]
    .sort((a, b) => order(a.customer, b.customer) || order(a.currency, b.currency))
    .map((group) => ({
      customer: group.customer,
      currency: group.currency,
      total: format(group.total, decimals(group.currency)),
      rows: group.rows,
    }));
  console.log(JSON.stringify({ groups: list, rejected }));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
