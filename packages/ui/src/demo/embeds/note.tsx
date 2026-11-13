import { Link, useSearchParams } from "react-router";
import { MarkdownPreview } from "@/components/note-form/markdown-preview";
import { TypeChip } from "@/components/note-form/note-preview";
import { Page } from "@/components/page";
import { ErrorState, Loading } from "@/components/state";
import { useT } from "@/i18n";
import { useNote, useNotes } from "@/lib/queries";
import { useEmbedReady } from "../embed";

/** Read-only note surface: reuse Markdown rendering without the editor, shell or local graph. */
export default function NoteEmbed() {
  const [params] = useSearchParams();
  const id = params.get("id") || "nextjs";
  const note = useNote(id);
  const notes = useNotes();
  const t = useT();
  useEmbedReady((note.isSuccess || note.isError) && notes.isSuccess);
  if (note.isPending) return <Loading />;
  if (note.error) return <ErrorState error={note.error} />;
  if (!note.data) return null;
  const detail = note.data;
  const titles = new Map(notes.data?.map((item) => [item.id, item.title]));
  return (
    <Page className="gap-5">
      <header>
        <TypeChip type={detail.type} />
        <h1 className="mt-3 text-2xl font-semibold">{detail.data.title || id}</h1>
      </header>
      <section aria-labelledby="note-properties">
        <h2 id="note-properties" className="sr-only">
          {t("editor.properties")}
        </h2>
        <pre
          className="overflow-x-auto rounded-xl border border-border bg-muted/30 p-4 font-mono text-xs"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: scrollable frontmatter needs a keyboard scroll target.
          tabIndex={0}
        >
          <code>{`---\n${Object.entries(detail.data)
            .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
            .join("\n")}\n---`}</code>
        </pre>
      </section>
      <MarkdownPreview body={detail.body} demoteHeadings />
      <section aria-labelledby="note-backlinks">
        <h2 id="note-backlinks" className="mb-2 text-sm font-semibold">
          {t("editor.backlinks")}
        </h2>
        {detail.backlinks.length ? (
          <ul className="flex flex-wrap gap-3">
            {detail.backlinks.map((target) => (
              <li key={target}>
                <Link
                  className="text-sm underline focus-visible:outline-2 focus-visible:outline-ring"
                  to={`/embed/note?id=${encodeURIComponent(target)}`}
                >
                  {titles.get(target) || target}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t("editor.noBacklinks")}</p>
        )}
      </section>
    </Page>
  );
}
