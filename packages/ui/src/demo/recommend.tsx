import { useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router";
import { Input } from "@/components/motion/input";
import { Page } from "@/components/page";
import { PageHeader } from "@/components/page-header";
import { ErrorState, Loading } from "@/components/state";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useNotes } from "@/lib/queries";
import scenarios from "../../../../scripts/demo/scenarios.json";
import { matchScenario } from "../../../../scripts/demo/scenarios.mjs";
import { useEmbedReady } from "./embed";

const copy = {
  en: {
    simulated: "Simulated example, not a live recommendation.",
    input: "Describe your project",
    submit: "Show example",
    noMatch: "No matching example. Try one of these five scenarios.",
    practice: "Practices",
    check: "Checks",
  },
  es: {
    simulated: "Ejemplo simulado, no es una recomendación en vivo.",
    input: "Describe tu proyecto",
    submit: "Mostrar ejemplo",
    noMatch: "No hay un ejemplo que coincida. Prueba uno de estos cinco escenarios.",
    practice: "Prácticas",
    check: "Checks",
  },
};

/** Demo-only replacement. Both full demo and embed share the same handwritten scenarios. */
export default function SimulatedRecommend() {
  const { language, t } = useI18n();
  const text = copy[language];
  const [params, setParams] = useSearchParams();
  const [input, setInput] = useState("");
  const [result, setResult] = useState<(typeof scenarios)[number] | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const notes = useNotes();
  const { pathname } = useLocation();
  const embedded = pathname.startsWith("/embed/");
  const selected = params.get("scenario") || params.get("preset");
  useEffect(() => {
    if (!selected) return;
    const scenario = scenarios.find((item) => item.id === selected) ?? null;
    setInput(scenario?.prompt[language] ?? "");
    setResult(scenario);
    setSubmitted(true);
  }, [selected, language]);
  useEmbedReady(notes.isSuccess);
  if (notes.isPending) return <Loading />;
  if (notes.error) return <ErrorState error={notes.error} />;
  const byId = new Map(notes.data?.map((note) => [note.id, note]));
  const noteLink = (id: string) => (embedded ? `/embed/note?id=${encodeURIComponent(id)}` : `/notes/${encodeURIComponent(id)}`);
  return (
    <Page className="gap-5" data-testid="simulated-recommend">
      <PageHeader title={t("page.recommend.title")} description={text.simulated} />
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setParams({}, { replace: true });
          setResult(matchScenario(input, scenarios));
          setSubmitted(true);
        }}
      >
        <label className="flex min-w-0 flex-1 flex-col gap-2 text-sm" htmlFor="demo-description">
          {text.input}
          <Input id="demo-description" value={input} onChange={setInput} />
        </label>
        <Button type="submit">{text.submit}</Button>
      </form>
      <div className="flex flex-wrap gap-2">
        {scenarios.map((scenario) => (
          <Button
            key={scenario.id}
            variant="outline"
            size="sm"
            aria-pressed={result?.id === scenario.id}
            onClick={() => {
              setParams({ scenario: scenario.id }, { replace: true });
              setInput(scenario.prompt[language]);
              setResult(scenario);
              setSubmitted(true);
            }}
          >
            {scenario.prompt[language]}
          </Button>
        ))}
      </div>
      <div aria-live="polite" aria-atomic="true">
        {submitted && !result && <p className="text-sm text-muted-foreground">{text.noMatch}</p>}
        {result && (
          <div className="flex flex-col gap-6" data-scenario={result.id}>
            {result.layers.map((layer) => (
              <section key={layer.id} aria-labelledby={`scenario-${layer.id}`}>
                <h2 id={`scenario-${layer.id}`} className="mb-3 text-sm font-semibold">
                  {byId.get(layer.id)?.title || layer.id}
                </h2>
                <ul className="divide-y divide-border rounded-xl border border-border bg-card px-4">
                  {layer.technologies
                    .filter((tech) => byId.has(tech.id))
                    .map((tech) => (
                      <li key={tech.id} className="py-3">
                        <Link
                          className="text-sm font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
                          aria-label={t("recommend.open", { title: byId.get(tech.id)?.title || tech.id })}
                          to={noteLink(tech.id)}
                        >
                          {byId.get(tech.id)?.title || tech.id}
                        </Link>
                        <p className="mt-1 text-sm text-muted-foreground">{tech.reason[language]}</p>
                      </li>
                    ))}
                </ul>
              </section>
            ))}
            {(["practices", "checks"] as const).map((kind) => (
              <section key={kind}>
                <h2 className="mb-2 text-sm font-semibold">{kind === "practices" ? text.practice : text.check}</h2>
                <ul className="flex flex-wrap gap-x-4 gap-y-2">
                  {result[kind]
                    .filter((id) => byId.has(id))
                    .map((id) => (
                      <li key={id}>
                        <Link
                          to={noteLink(id)}
                          className="text-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
                        >
                          {byId.get(id)?.title || id}
                        </Link>
                      </li>
                    ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </Page>
  );
}
