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
try {
  const [header, ...body] = parseCsv(fs.readFileSync(0, "utf8"));
  if (header?.join(",") !== "id,name,amount") throw new Error("Unexpected header");
  const rows = [],
    seen = new Set(),
    rejected = { malformed: 0, invalid: 0, duplicate: 0 };
  for (const record of body) {
    if (record.length !== 3) {
      rejected.malformed++;
      continue;
    }
    const [id, name, amount] = record.map((value) => value.trim());
    if (!/^\d+$/.test(id) || name === "" || !(amount === "" || /^\d+(\.\d{1,2})?$/.test(amount))) {
      rejected.invalid++;
      continue;
    }
    if (seen.has(id)) {
      rejected.duplicate++;
      continue;
    }
    seen.add(id);
    rows.push({ id, name, amount: amount === "" ? null : amount });
  }
  console.log(JSON.stringify({ rows, summary: { accepted: rows.length, rejected } }));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
