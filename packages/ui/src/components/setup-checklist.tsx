import { Check, Circle, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { GlossaryLink } from "@/components/glossary-link";
import { useI18n } from "@/i18n";
import { useConnectStatus, useHealth, useNotes, usePacks } from "@/lib/queries";
import { readSetupFlag, setupProgress, writeSetupFlag } from "@/lib/setup-progress";

export function SetupChecklist() {
  const health = useHealth();
  return health.data?.ok ? <VaultChecklist key={health.data.vault} vault={health.data.vault} /> : null;
}

function VaultChecklist({ vault }: { vault: string }) {
  const { t } = useI18n();
  const packs = usePacks();
  const connect = useConnectStatus();
  const notes = useNotes();
  const [dismissed, setDismissed] = useState(() => readSetupFlag(vault, "dismissed"));
  const completed = setupProgress({
    vaultLoaded: true,
    packs: packs.data,
    clients: connect.data?.clients,
    notes: notes.data,
    approvedBefore: readSetupFlag(vault, "approved"),
  });
  const approved = completed[3];
  useEffect(() => {
    if (approved) writeSetupFlag(vault, "approved");
  }, [vault, approved]);
  if (dismissed || completed.every(Boolean)) return null;

  const steps = [
    { id: "vault", title: t("home.steps.vault"), description: t("home.steps.vault.description"), to: "/settings", error: false },
    { id: "pack", title: t("home.steps.pack"), description: t("home.steps.pack.description"), to: "/?packs=1", error: packs.isError },
    {
      id: "agent",
      title: t("home.steps.agent"),
      description: t("home.steps.agent.description"),
      to: "/settings?section=agents",
      error: connect.isError,
    },
    {
      id: "proposal",
      title: t("home.steps.proposal"),
      description: t("home.steps.proposal.description"),
      to: "/inbox",
      error: notes.isError,
    },
  ];
  const done = completed.filter(Boolean).length;
  return (
    <section data-testid="home-getting-started" aria-labelledby="home-setup-title" className="min-w-0 rounded-xl bg-muted/30 p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="home-setup-title" className="text-sm font-semibold">
            {t("home.steps.title")}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground" role="status">
            {t(done === 1 ? "home.steps.progressOne" : "home.steps.progress", { done })}
          </p>
        </div>
        <button
          type="button"
          aria-label={t("home.steps.dismiss")}
          onClick={() => {
            writeSetupFlag(vault, "dismissed");
            setDismissed(true);
          }}
          className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
      <ol className="my-3 flex flex-col gap-3">
        {steps.map((step, index) => {
          const complete = completed[index];
          const Icon = complete ? Check : Circle;
          const state = t(
            complete
              ? "home.steps.done"
              : step.error
                ? "home.steps.unavailable"
                : complete === undefined
                  ? "state.loading"
                  : "home.steps.todo",
          );
          return (
            <li
              key={step.id}
              data-step={step.id}
              data-complete={complete === undefined ? "unknown" : String(complete)}
              className="flex items-start gap-2.5"
            >
              <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0">
                <Link
                  to={step.to}
                  className="rounded-sm text-sm font-medium underline underline-offset-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {step.title}
                </Link>
                <span className="sr-only">{`: ${state}`}</span>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{step.description}</p>
                {step.error ? <p className="text-xs text-muted-foreground">{state}</p> : null}
              </div>
            </li>
          );
        })}
      </ol>
      <GlossaryLink />
    </section>
  );
}
