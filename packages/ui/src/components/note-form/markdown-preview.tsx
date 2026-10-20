import { type ReactNode, useMemo } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import { useNavigate } from "react-router";
import remarkGfm from "remark-gfm";
import { useT } from "@/i18n";
import { useNotes } from "@/lib/queries";
import { NotePreview, TypeDot } from "./note-preview";

const WIKILINK = /\[\[([^\]|#\n]+)(?:\|([^\]\n]+))?\]\]/g;
const SCHEME = "basics-wikilink:";

/** Replace `[[id|label]]` outside fenced blocks and inline code with markdown links. */
export function replaceWikilinks(body: string): string {
  let fenced = false;
  return body
    .split("\n")
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        fenced = !fenced;
        return line;
      }
      if (fenced) return line;
      return line
        .split(/(`+[^`]*`+)/g)
        .map((part, index) =>
          index % 2 === 1
            ? part
            : part.replace(WIKILINK, (_, id: string, label: string | undefined) => `[${label ?? id}](${SCHEME}${encodeURIComponent(id)})`),
        )
        .join("");
    })
    .join("\n");
}

const PROSE =
  "text-[15px] leading-[1.65] [&_h1]:mt-6 [&_h1]:mb-3 [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:tracking-tight [&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:tracking-tight [&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_p]:my-3 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_a]:text-primary [&_a]:underline-offset-2 hover:[&_a]:underline [&_code]:rounded-md [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13px] [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:border [&_pre]:border-border [&_pre]:bg-card [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-medium [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-primary [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_hr]:my-5 [&_hr]:border-border [&_img]:my-3 [&_img]:rounded-xl";

function WikiLink({ id, children }: { id: string; children: ReactNode }) {
  const t = useT();
  const navigate = useNavigate();
  const notes = useNotes();
  const summary = notes.data?.find((note) => note.id === id);
  const missing = notes.data !== undefined && summary === undefined;
  const label = children ?? id;

  if (missing) {
    return (
      <button
        type="button"
        title={t("editor.wikilinkMissing")}
        onClick={() => window.dispatchEvent(new CustomEvent("basics:new-note", { detail: { id } }))}
        className="rounded-sm text-destructive underline decoration-dashed underline-offset-4 hover:text-destructive/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {label}
      </button>
    );
  }

  return (
    <NotePreview id={id}>
      <button
        type="button"
        onClick={() => navigate(`/notes/${encodeURIComponent(id)}`)}
        className="inline-flex items-baseline gap-1.5 rounded-sm text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <TypeDot type={summary?.type} className="translate-y-[-1px]" />
        {label}
        {summary ? <span className="sr-only"> ({summary.id})</span> : null}
      </button>
    </NotePreview>
  );
}

export function MarkdownPreview({ body, className }: { body: string; className?: string }) {
  const t = useT();
  const source = useMemo(() => replaceWikilinks(body), [body]);

  return (
    <div className={className}>
      <div className={PROSE}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          urlTransform={(url) => (url.startsWith(SCHEME) ? url : defaultUrlTransform(url))}
          components={{
            a({ href, children }) {
              if (href?.startsWith(SCHEME)) {
                return <WikiLink id={decodeURIComponent(href.slice(SCHEME.length))}>{children}</WikiLink>;
              }
              return (
                <a href={href} target="_blank" rel="noreferrer">
                  {children}
                </a>
              );
            },
          }}
        >
          {source}
        </ReactMarkdown>
      </div>
      {body.trim() ? null : <p className="text-sm text-muted-foreground">{t("editor.emptyBody")}</p>}
    </div>
  );
}
