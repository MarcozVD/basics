import fs from "node:fs";

function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const records = [];
  let row = [],
    field = "",
    quoted = false,
    inQuotes = false,
    closed = false,
    fresh = true;
  const end = () => {
    row.push(field);
    if (!(row.length === 1 && row[0] === "" && !quoted)) records.push(row);
    row = [];
    field = "";
    quoted = false;
    closed = false;
    fresh = true;
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c !== '"') field += c;
      else if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = false;
        closed = true;
      }
    } else if (c === ",") {
      row.push(field);
      field = "";
      closed = false;
      fresh = true;
    } else if (c === "\n" || (c === "\r" && text[i + 1] === "\n")) {
      if (c === "\r") i++;
      end();
    } else if (closed) throw new Error("Invalid CSV after closing quote");
    else if (c === '"' && fresh) {
      inQuotes = true;
      quoted = true;
      fresh = false;
    } else {
      field += c;
      fresh = false;
    }
  }
  if (inQuotes) throw new Error("Unterminated quoted field");
  if (field !== "" || row.length || quoted) end();
  return records;
}
const order = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
function side(text) {
  const [header, ...body] = parseCsv(text);
  if (header?.join(",") !== "sku,qty") throw new Error("Unexpected header");
  const records = new Map();
  let rejected = 0;
  for (const record of body) {
    if (record.length !== 2) {
      rejected++;
      continue;
    }
    const [sku, qty] = record.map((value) => value.trim());
    if (sku === "" || !/^\d+$/.test(qty) || records.has(sku)) {
      rejected++;
      continue;
    }
    records.set(sku, Number(qty));
  }
  return { records, rejected };
}
try {
  const input = JSON.parse(fs.readFileSync(0, "utf8"));
  if (!input || typeof input !== "object" || typeof input.expected !== "string" || typeof input.observed !== "string")
    throw new Error("Invalid input");
  const expected = side(input.expected),
    observed = side(input.observed);
  const additions = [],
    removals = [],
    changes = [];
  for (const [sku, qty] of observed.records) {
    if (!expected.records.has(sku)) additions.push({ sku, qty });
    else if (expected.records.get(sku) !== qty) changes.push({ sku, expected: expected.records.get(sku), observed: qty });
  }
  for (const [sku, qty] of expected.records) if (!observed.records.has(sku)) removals.push({ sku, qty });
  for (const list of [additions, removals, changes]) list.sort((a, b) => order(a.sku, b.sku));
  console.log(JSON.stringify({ additions, removals, changes, rejected: { expected: expected.rejected, observed: observed.rejected } }));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
