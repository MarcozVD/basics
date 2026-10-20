import { AlertTriangle, Inbox as InboxIcon } from "lucide-react";
import { Loader } from "@/components/motion/loader";
import { useT } from "@/i18n";
import { ApiRequestError } from "@/lib/api";

export function Loading({ label }: { label?: string }) {
  const t = useT();
  return (
    <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader variant="spinner" size={16} className="text-muted-foreground" label={label ?? t("state.loading")} />
      {label ?? t("state.loading")}
    </div>
  );
}

export function ErrorState({ error }: { error: unknown }) {
  const t = useT();
  const vaultMissing = error instanceof ApiRequestError && error.body.error === "vault_not_found";
  const message = vaultMissing
    ? t("state.error.vaultNotFound")
    : error instanceof Error && error.message
      ? error.message
      : t("state.error.unknown");

  return (
    <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <AlertTriangle className="size-4 text-destructive" aria-hidden="true" />
        {t("state.error.title")}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

export function Empty({ title, description }: { title?: string; description?: string }) {
  const t = useT();
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-dashed px-4 py-10 text-center">
      <InboxIcon className="mb-1 size-5 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-medium">{title ?? t("state.empty.title")}</p>
      <p className="text-sm text-muted-foreground">{description ?? t("state.empty.description")}</p>
    </div>
  );
}
