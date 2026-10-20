import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";

export function NotFoundPage() {
  const t = useT();
  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10">
      <h1 className="text-lg font-semibold tracking-tight">{t("page.notFound.title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("page.notFound.description")}</p>
      <Button asChild variant="outline" size="sm" className="mt-4">
        <Link to="/explore">{t("page.notFound.back")}</Link>
      </Button>
    </div>
  );
}
