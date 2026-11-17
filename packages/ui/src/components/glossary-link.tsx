import { useI18n } from "@/i18n";

export function GlossaryLink() {
  const { t } = useI18n();
  return (
    <a
      href="https://marcozvd.github.io/basics/guide/glossary.html"
      target="_blank"
      rel="noreferrer"
      className="inline-flex w-fit rounded-sm text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {t("glossary.link")}
    </a>
  );
}
