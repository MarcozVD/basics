import matter from "gray-matter";

/**
 * gray-matter picks its parser from the opening fence: `---js` (or `---javascript`,
 * `---coffee`) runs the frontmatter through `eval`. Notes come from community packs,
 * shared vaults and agent-installed skills, so a crafted file could run code in the
 * CLI or the server just by being read. Only YAML (the default) and JSON are allowed.
 */
function refuse(language: string) {
  const fail = (): never => {
    throw new Error(`frontmatter written in ${language} is not supported; use YAML`);
  };
  return { parse: fail, stringify: fail };
}

const SAFE_OPTIONS = {
  engines: {
    js: refuse("js"),
    javascript: refuse("javascript"),
    coffee: refuse("coffee"),
    coffeescript: refuse("coffeescript"),
    cson: refuse("cson"),
  },
};

export type ParsedFrontmatter = matter.GrayMatterFile<string>;

/** Split a markdown file into frontmatter data and body without ever evaluating code. */
export function parseFrontmatter(input: string): ParsedFrontmatter {
  // Passing options also turns off gray-matter's global cache, which is keyed by the
  // input string alone and could hand back a result parsed with other options.
  return matter(input, SAFE_OPTIONS);
}
