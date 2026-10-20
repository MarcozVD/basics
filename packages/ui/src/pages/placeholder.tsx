import type { TranslationKey } from "@/i18n";
import { useT } from "@/i18n";

export function PlaceholderPage({ titleKey, detail }: { titleKey: TranslationKey; detail?: string }) {
  const t = useT();
  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-6">
      <h1 className="text-lg font-semibold tracking-tight">{t(titleKey)}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("page.placeholder")}</p>
      {detail && (
        <div className="mt-4 rounded-md border px-3 py-2">
          <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{t("note.id")}</div>
          <div className="font-mono text-[13px] break-all">{detail}</div>
        </div>
      )}
    </div>
  );
}
