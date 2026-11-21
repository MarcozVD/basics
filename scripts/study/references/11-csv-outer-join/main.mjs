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
  if (!header || new Set(header).size !== header.length || !header.includes(key)) throw new Error("Invalid header");
  const index = header.indexOf(key);
  let rejected = 0;
  const records = [];
  for (const record of body) {
    if (record.length !== header.length || record[index] === "") rejected++;
    else records.push(record);
  }
  return { header, index, records, rejected };
}
let key;
try {
  const input = JSON.parse(fs.readFileSync(0, "utf8"));
  if (!input || typeof input !== "object" || [input.key, input.left, input.right].some((value) => typeof value !== "string") || !input.key)
    throw new Error("Invalid input");
  key = input.key;
  const left = side(input.left),
    right = side(input.right);
  const leftOthers = left.header.filter((name) => name !== key),
    rightOthers = right.header.filter((name) => name !== key);
  const columns = [
    key,
    ...leftOthers.map((name) => (rightOthers.includes(name) ? `left_${name}` : name)),
    ...rightOthers.map((name) => (leftOthers.includes(name) ? `right_${name}` : name)),
  ];
  const cells = (record, side, others) => others.map((name) => (record ? record[side.header.indexOf(name)] : null));
  const groups = new Map();
  for (const [name, source] of [
    ["left", left],
    ["right", right],
  ])
    for (const record of source.records) {
      const value = record[source.index];
      if (!groups.has(value)) groups.set(value, { left: [], right: [] });
      groups.get(value)[name].push(record);
    }
  const rows = [];
  for (const value of [...groups.keys()].sort(order)) {
    const group = groups.get(value);
    for (const l of group.left.length ? group.left : [null])
      for (const r of group.right.length ? group.right : [null])
        rows.push([value, ...cells(l, left, leftOthers), ...cells(r, right, rightOthers)]);
  }
  console.log(JSON.stringify({ columns, rows, rejected: { left: left.rejected, right: right.rejected } }));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
