import fs from "node:fs";

const account = /^[a-z0-9-]{1,20}$/;
const amountText = /^\d+(\.\d{1,2})?$/;
const cents = (text) => {
  const [whole, fraction = ""] = text.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
};
const fields = {
  deposit: ["id", "type", "account", "amount"],
  withdraw: ["id", "type", "account", "amount"],
  transfer: ["id", "type", "from", "to", "amount"],
};
const signature = (op) => JSON.stringify(Object.entries(op).sort());
function valid(op) {
  if (!op || typeof op !== "object" || Array.isArray(op) || typeof op.id !== "string" || op.id === "" || !Object.hasOwn(fields, op.type))
    return false;
  const keys = Object.keys(op);
  if (keys.length !== fields[op.type].length || !keys.every((key) => fields[op.type].includes(key))) return false;
  for (const key of ["account", "from", "to"]) if (key in op && !(typeof op[key] === "string" && account.test(op[key]))) return false;
  if (typeof op.amount !== "string" || !amountText.test(op.amount)) return false;
  const value = cents(op.amount);
  return value > 0 && value <= 100000000000;
}
try {
  const ops = JSON.parse(fs.readFileSync(0, "utf8"));
  if (!Array.isArray(ops)) throw new Error("Expected an array of operations");
  const balances = new Map(),
    applied = new Map(),
    history = [];
  for (const op of ops) {
    const id = typeof op?.id === "string" ? op.id : null;
    const reject = (reason) => history.push({ id, status: "rejected", reason });
    if (!valid(op)) {
      reject("invalid");
      continue;
    }
    if (applied.has(op.id)) {
      if (applied.get(op.id) === signature(op)) history.push({ id, status: "duplicate" });
      else reject("id_conflict");
      continue;
    }
    const value = cents(op.amount);
    if (op.type === "transfer") {
      if (op.from === op.to) {
        reject("same_account");
        continue;
      }
      if (!balances.has(op.from) || !balances.has(op.to)) {
        reject("unknown_account");
        continue;
      }
      if (balances.get(op.from) < value) {
        reject("insufficient_funds");
        continue;
      }
      balances.set(op.from, balances.get(op.from) - value);
      balances.set(op.to, balances.get(op.to) + value);
    } else if (op.type === "deposit") {
      balances.set(op.account, (balances.get(op.account) ?? 0) + value);
    } else {
      if (!balances.has(op.account)) {
        reject("unknown_account");
        continue;
      }
      if (balances.get(op.account) < value) {
        reject("insufficient_funds");
        continue;
      }
      balances.set(op.account, balances.get(op.account) - value);
    }
    applied.set(op.id, signature(op));
    history.push({ id, status: "applied" });
  }
  const out = {};
  for (const [name, value] of balances) out[name] = `${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`;
  console.log(JSON.stringify({ balances: out, history }));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
