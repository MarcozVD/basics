import type { ProposalSummary } from "@marcozvd/basics-core";

export interface PackProposer {
  name: string;
  version: string;
  /** Original `proposed_by`, e.g. `pack:python-api@1.1.0`. */
  from: string;
}

export interface PackProposalGroup extends PackProposer {
  proposals: ProposalSummary[];
}

/** `pack:<name>@<version>` proposers; anything else is a regular agent. */
export function packProposer(proposedBy: string): PackProposer | null {
  const match = /^pack:([^@]+)@(.+)$/.exec(proposedBy);
  return match ? { name: match[1], version: match[2], from: proposedBy } : null;
}

/** Pending proposals grouped by the pack version that proposed them. */
export function groupPackProposals(proposals: ProposalSummary[]): PackProposalGroup[] {
  const groups = new Map<string, PackProposalGroup>();
  for (const proposal of proposals) {
    const pack = packProposer(proposal.meta.proposed_by);
    if (!pack) continue;
    const group = groups.get(pack.from) ?? { ...pack, proposals: [] };
    group.proposals.push(proposal);
    groups.set(pack.from, group);
  }
  return [...groups.values()];
}
