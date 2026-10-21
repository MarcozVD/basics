import type { Note, NoteData } from "./schema.js";
import { NotFoundError, type Vault } from "./vault.js";

export interface TechOutcomeUpdate {
  id: string;
  add_use_when?: string[];
  add_avoid_when?: string[];
  add_performs_best?: string[];
  lesson?: string;
}

export interface OutcomeInput {
  project: string;
  summary: string;
  lessons?: string[];
  tech_updates?: TechOutcomeUpdate[];
}

const LESSONS_HEADING = /^##\s+Lessons\s*$/;

function clean(items: string[] | undefined): string[] {
  return (items ?? []).map((item) => item.trim()).filter(Boolean);
}

/** Append list items, optionally ignoring case, without touching the existing entries. */
function appendUnique(existing: string[], additions: string[], ignoreCase = false): string[] {
  const next = [...existing];
  const seen = new Set(existing.map((item) => (ignoreCase ? item.trim().toLowerCase() : item)));
  for (const item of additions) {
    const key = ignoreCase ? item.toLowerCase() : item;
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(item);
  }
  return next;
}

function appendSection(body: string, section: string): string {
  const trimmed = body.trimEnd();
  return trimmed ? `${trimmed}\n\n${section}` : section;
}

/** Insert a bullet at the end of the `## Lessons` section, creating it when missing. */
function appendLesson(body: string, lesson: string): string {
  const bullet = `- ${lesson.trim()}`;
  const lines = body.trimEnd().split(/\r?\n/);
  if (lines.some((line) => line.trim() === bullet)) return lines.join("\n");
  const start = lines.findIndex((line) => LESSONS_HEADING.test(line));
  if (start < 0) return appendSection(body, `## Lessons\n\n${bullet}`);

  let end = start + 1;
  while (end < lines.length && !/^#{1,2}\s+/.test(lines[end])) end++;
  let insert = end;
  while (insert > start + 1 && lines[insert - 1].trim() === "") insert--;
  lines.splice(insert, 0, bullet);
  return lines.join("\n");
}

function projectData(vault: Vault, note: Note): Extract<NoteData, { type: "project" }> {
  const data = vault.getProposal(note.id)?.data ?? note.data;
  if (data.type !== "project") throw new NotFoundError(note.id);
  return data;
}

function techData(vault: Vault, note: Note): Extract<NoteData, { type: "tech" }> {
  const data = vault.getProposal(note.id)?.data ?? note.data;
  if (data.type !== "tech") throw new Error(`not a tech note: ${note.id}`);
  return data;
}

/**
 * Propose a project outcome: lessons on the project, optional tech additions, and a dated
 * summary section. Pending proposals for the same note are used as the base and extended.
 */
export function recordOutcome(vault: Vault, input: OutcomeInput, agent: string): string[] {
  const project = vault.get(input.project);
  if (!project) throw new NotFoundError(input.project);
  if (project.data.type !== "project") throw new NotFoundError(input.project);

  const summary = input.summary.trim();
  const reason = `Outcome of ${project.id}: ${summary.slice(0, 80)}`;
  const date = new Date().toISOString().slice(0, 10);
  const drafts = new Map<string, { data: NoteData; body: string }>();

  const base = projectData(vault, project);
  const lessons = appendUnique(base.lessons ?? [], clean(input.lessons));
  drafts.set(project.id, {
    data: {
      ...base,
      lessons,
      ...(base.reason?.trim() ? {} : { reason: summary }),
    },
    body: appendSection(vault.getProposal(project.id)?.body ?? project.body, `## Outcome ${date}\n\n${summary}`),
  });

  for (const update of input.tech_updates ?? []) {
    const note = vault.get(update.id);
    if (!note) throw new NotFoundError(update.id);
    if (note.data.type !== "tech") throw new Error(`not a tech note: ${update.id}`);
    const current = (drafts.get(note.id)?.data ?? techData(vault, note)) as Extract<NoteData, { type: "tech" }>;
    const currentBody = drafts.get(note.id)?.body ?? vault.getProposal(note.id)?.body ?? note.body;
    drafts.set(note.id, {
      data: {
        ...current,
        use_when: appendUnique(current.use_when, clean(update.add_use_when), true),
        avoid_when: appendUnique(current.avoid_when, clean(update.add_avoid_when), true),
        performs_best: appendUnique(current.performs_best, clean(update.add_performs_best), true),
      },
      body: update.lesson?.trim() ? appendLesson(currentBody, update.lesson) : currentBody,
    });
  }

  const ids: string[] = [];
  for (const [id, draft] of drafts) {
    vault.propose(id, draft.data, draft.body, { proposed_by: agent, reason });
    ids.push(id);
  }
  return ids;
}
