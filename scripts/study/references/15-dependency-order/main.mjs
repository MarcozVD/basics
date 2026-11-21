import fs from "node:fs";

try {
  const input = JSON.parse(fs.readFileSync(0, "utf8"));
  if (
    !input ||
    Array.isArray(input) ||
    Object.keys(input).sort().join(",") !== "edges,nodes" ||
    !Array.isArray(input.nodes) ||
    !Array.isArray(input.edges) ||
    input.nodes.some((id) => typeof id !== "string" || !/^[a-z][a-z0-9-]*$/.test(id)) ||
    new Set(input.nodes).size !== input.nodes.length
  )
    throw new Error("Invalid graph");
  const children = new Map(input.nodes.map((id) => [id, new Set()])),
    degree = new Map(input.nodes.map((id) => [id, 0]));
  for (const edge of input.edges) {
    if (!Array.isArray(edge) || edge.length !== 2 || !children.has(edge[0]) || !children.has(edge[1]))
      throw new Error("Undeclared or malformed edge");
    const [from, to] = edge;
    if (!children.get(from).has(to)) {
      children.get(from).add(to);
      degree.set(to, degree.get(to) + 1);
    }
  }
  const ready = input.nodes.filter((id) => degree.get(id) === 0),
    order = [];
  while (ready.length) {
    ready.sort();
    const id = ready.shift();
    order.push(id);
    for (const to of children.get(id)) {
      degree.set(to, degree.get(to) - 1);
      if (!degree.get(to)) ready.push(to);
    }
  }
  const cycle = order.length !== input.nodes.length;
  console.log(JSON.stringify({ order: cycle ? [] : order, cycle }));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
