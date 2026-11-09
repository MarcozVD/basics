import { Link } from "react-router";
import { Page } from "@/components/page";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { useDocumentTitle } from "@/lib/page-title";

export function NotFoundPage() {
  const t = useT();
  useDocumentTitle(t("page.notFound.title"));
  return (
    <Page>
      <PageHeader
        title={t("page.notFound.title")}
        description={t("page.notFound.description")}
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/explore">{t("page.notFound.back")}</Link>
          </Button>
        }
      />
    </Page>
  );
}
