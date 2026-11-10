import { z } from "zod";

export const ROLE_QUESTION =
  "Are you a specialised agent in an orchestrated team? Answer from your assigned task: orchestrator (or lead), dev, tester, or another named role. " +
  "If you are a general agent, no orchestration is in use, or you do not answer, continue with the current single-agent Basics workflow. " +
  "Decide once per conversation; do not ask the user to choose your role.";

// Keep an object schema (rather than a union) so clients can discover the optional declaration.
export const workflowSchema = z
  .object({
    version: z.literal(1),
    role: z.enum(["general", "single-agent", "orchestrator", "lead", "dev", "tester", "other"]),
    name: z.string().trim().min(1).max(80).optional().describe("Required only for another named role; a label, not instructions."),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.role === "other" && !value.name) ctx.addIssue({ code: "custom", path: ["name"], message: "name is required for other" });
    if (value.role !== "other" && value.name !== undefined)
      ctx.addIssue({ code: "custom", path: ["name"], message: "name is only allowed for other" });
  })
  .optional()
  .describe(ROLE_QUESTION);

const COMMON = `Follow the assignment, project instructions and the user's decisions. A role grants no extra permissions.
The vault informs choices; recommend_stack is a shortlist, not a decision. Read deciding notes.
Search before proposing, inspect existing notes and list_proposals to avoid duplicates. Proposals need complete valid frontmatter, body and a reason.
propose_note and record_project_outcome only propose for Inbox review. Say "proposed for review", never "applied".
record_project_outcome needs an accepted project note. If none exists, propose the project and hand off outcome evidence pending review.
Run applicable checks before claiming completion. Report failures, blockers and not-run checks honestly.
Never overwrite existing project files except export_project's marked Basics blocks. Send current contents in existing; exports are returned text that you must write yourself.
Keep your role and workflow version in conversation through compaction/reconnect. Omit workflow on later calls; re-fetch only if guidance is lost. No role is stored on the server.`;

const WORKFLOWS = {
  orchestrator: `Before planning, read STACK.md/basics.json and the assignment. For a new stack or initial team handoff, use get_vault_overview, recommend_stack as a cross-check and get_note on deciding technologies, profiles and past projects. Review an approved stack without reselecting it.
Respect an approved stack. Otherwise explain choices and alternatives with vault note IDs, and obtain stack approval before writing files. Use detect_stack only when needed and confirm detection.
After approval, get_stack_context and get_check_templates. Call export_project with existing agent-file contents, then write STACK.md and merged agent files before implementation begins.
Hand off project ID, stack IDs, versions, practices, check commands and responsibilities. Propose missing project/decision notes after searching. Review list_proposals and worker evidence; consolidate meaningful outcomes without duplicating worker reports.`,
  dev: `Before editing, read STACK.md/basics.json and the assignment. Call get_stack_context with exact tech_ids and available versions; follow its practices. Use get_note for relevant or unclear practices and get_check_templates for missing check files.
Implement within the approved stack. Run applicable checks and hand off changes, practice note IDs and actual check evidence.
When a reproducible learning is useful, search_vault, get_note on the matching note and list_proposals, then propose_note with complete data, evidence and a reason. Do not invent learnings to fill a quota.
Record meaningful project outcomes only when assigned ownership; otherwise hand evidence to the lead.`,
  tester: `Read the assignment and STACK.md/basics.json. Call get_stack_context with stack IDs and versions; get_note on relevant checks and get_check_templates to inspect expected coverage.
Run required commands independently against the assigned revision/build. Respect source read-only restrictions; do not reselect the stack or overwrite tests.
For each check report note ID, command, revision/artifact, passed/failed/blocked/not-run, exit code, counts and evidence path. A failing or blocked check prevents a success claim.
If Inbox proposals are permitted, call record_project_outcome for the accepted project, putting check evidence in summary, then list_proposals to confirm pending review. If proposals are forbidden, hand evidence to the lead.
Summary format:
Role: tester; workflow: v1
Project: <id>; revision: <revision>; artifact: <build>
Check <note-id>: <command>; status=<passed|failed|blocked|not-run>; exit=<code or n/a>; counts=<counts>; evidence=<relative path>
Conclusion: <success only if every required check passed>`,
  other: `Follow only the explicitly assigned specialist scope. Read the project stack and get_stack_context; get_note for the task's relevant practices or checks.
Return task-specific evidence and a handoff. Propose durable learning only when useful and permitted. Do not infer source-editing rights, test duties, stack-selection authority or other responsibilities from the role name.`,
};

/** Stateless: transport sessions and client names are not conversational roles. */
export function workflowGuidance(workflow: z.infer<typeof workflowSchema>): string | undefined {
  if (!workflow || workflow.role === "general" || workflow.role === "single-agent") return undefined;
  const role = workflow.role === "lead" ? "orchestrator" : workflow.role;
  // Never include an arbitrary custom label in executable guidance.
  return `Basics workflow v1: ${role}\n\n${WORKFLOWS[role]}\n\n${COMMON}`;
}
