import { autocompletion } from "@codemirror/autocomplete";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, MatchDecorator, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { tintText } from "@/lib/type-color";

export interface WikilinkOption {
  id: string;
  title: string;
  detail: string;
}

const WIKILINK = /\[\[[^\]\n]+\]\]/g;

const matcher = new MatchDecorator({
  regexp: WIKILINK,
  decoration: Decoration.mark({ class: "cm-wikilink" }),
});

const highlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = matcher.createDeco(view);
    }

    update(update: ViewUpdate) {
      this.decorations = matcher.updateDeco(update, this.decorations);
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

const highlightStyle = HighlightStyle.define([
  {
    tag: [tags.heading1, tags.heading2, tags.heading3, tags.heading4, tags.heading5, tags.heading6],
    color: "var(--foreground)",
    fontWeight: "600",
  },
  { tag: tags.strong, color: "var(--foreground)", fontWeight: "700" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: [tags.keyword, tags.operator, tags.atom, tags.bool], color: tintText("var(--type-profile)") },
  { tag: [tags.string, tags.special(tags.string)], color: tintText("var(--type-practice)") },
  { tag: tags.comment, color: "var(--muted-foreground)", fontStyle: "italic" },
  { tag: [tags.link, tags.url], color: "var(--primary-text)" },
  { tag: tags.monospace, color: tintText("var(--type-check)") },
  { tag: [tags.list, tags.contentSeparator, tags.meta], color: "var(--muted-foreground)" },
  { tag: tags.quote, color: "var(--muted-foreground)", fontStyle: "italic" },
  { tag: tags.invalid, color: "var(--destructive-text)" },
]);

const theme = EditorView.theme({
  "&": { backgroundColor: "var(--card)", color: "var(--foreground)", fontSize: "13px" },
  ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.6" },
  ".cm-content": { padding: "10px 0", caretColor: "var(--foreground)" },
  ".cm-gutters": { backgroundColor: "transparent", color: "var(--muted-foreground)", border: "none" },
  ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--foreground) 4%, transparent)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "color-mix(in srgb, var(--ring) 22%, transparent)",
  },
  ".cm-cursor": { borderLeftColor: "var(--foreground)" },
  ".cm-wikilink": { color: "var(--primary-text)" },
  ".cm-tooltip": {
    backgroundColor: "var(--popover)",
    color: "var(--popover-foreground)",
    border: "1px solid var(--border)",
    borderRadius: "12px",
    overflow: "hidden",
  },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
    backgroundColor: "var(--muted)",
    color: "var(--foreground)",
  },
});

/** `[[` autocomplete over the vault plus wikilink highlighting and token theming. */
export function wikilinkExtensions(options: WikilinkOption[]): Extension[] {
  return [
    highlight,
    syntaxHighlighting(highlightStyle),
    autocompletion({
      activateOnTyping: true,
      override: [
        (context) => {
          const match = context.matchBefore(/\[\[[^\]\n]*$/);
          if (!match) return null;
          return {
            from: match.from + 2,
            options: options.map((option) => ({
              label: option.title,
              detail: option.detail,
              apply: `${option.id}]]`,
              type: "text",
            })),
            validFor: /^[^\]\n]*$/,
          };
        },
      ],
    }),
    theme,
  ];
}
