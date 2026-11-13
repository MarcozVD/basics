import type { ApproveRequest } from "@marcozvd/basics-core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { ProposalDetail, ProposalEditModal } from "@/components/proposal-detail";
import { ErrorState, Loading } from "@/components/state";
import { useT } from "@/i18n";
import { approveProposal, rejectProposal } from "@/lib/api";
import { useLayers, useProposal } from "@/lib/queries";
import { useEmbedReady } from "../embed";

export default function ProposalEmbed() {
  const [params] = useSearchParams();
  const id = params.get("id") || "cli-error-messages";
  const proposal = useProposal(id);
  const layers = useLayers();
  const queryClient = useQueryClient();
  const t = useT();
  const [edit, setEdit] = useState(false);
  const [outcome, setOutcome] = useState<"approved" | "rejected" | null>(null);
  const decision = useMutation({
    mutationFn: async ({ approve, override }: { approve: boolean; override?: ApproveRequest }) => {
      if (approve) await approveProposal(id, override);
      else await rejectProposal(id);
      return approve;
    },
    onSuccess: (approve) => {
      setOutcome(approve ? "approved" : "rejected");
      setEdit(false);
      void queryClient.invalidateQueries();
    },
  });
  useEmbedReady((proposal.isSuccess || proposal.isError) && layers.isSuccess);
  if (outcome)
    return (
      <div className="grid min-h-60 place-items-center p-6" role="status">
        {t(outcome === "approved" ? "proposal.approved" : "proposal.rejected")}
      </div>
    );
  if (proposal.isPending) return <Loading />;
  if (proposal.error) return <ErrorState error={proposal.error} />;
  if (!proposal.data) return null;
  return (
    <div className="flex min-h-dvh flex-col p-4">
      {decision.error && <ErrorState error={decision.error} />}
      <ProposalDetail
        proposal={proposal.data}
        variant="panel"
        busy={decision.isPending}
        armed={false}
        onApprove={() => decision.mutate({ approve: true })}
        onReject={() => decision.mutate({ approve: false })}
        onEdit={() => setEdit(true)}
      />
      <ProposalEditModal
        proposal={proposal.data}
        open={edit}
        onOpenChange={setEdit}
        errors={{}}
        pending={decision.isPending}
        onSubmit={(data, body) => decision.mutate({ approve: true, override: { data, body } })}
      />
    </div>
  );
}
