import fs from "node:fs";

const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
function merge(base, overlay) {
  const result = Object.assign(Object.create(null), object(base) ? base : {});
  for (const [key, value] of Object.entries(overlay)) {
    if (value === null) delete result[key];
    else result[key] = object(value) ? merge(result[key], value) : value;
  }
  return result;
}
try {
  const overlays = JSON.parse(fs.readFileSync(0, "utf8"));
  if (!Array.isArray(overlays) || !overlays.every(object)) throw new Error("Expected an array of object overlays");
  console.log(JSON.stringify(overlays.reduce(merge, Object.create(null))));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
