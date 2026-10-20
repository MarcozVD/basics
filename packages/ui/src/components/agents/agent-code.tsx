"use client";

import { type CSSProperties, Fragment, useEffect, useState } from "react";
import type { HighlighterCore, LanguageInput } from "shiki/core";
import { cn } from "@/lib/utils";

export type AgentCodeLanguage = "bash" | "diff" | "json" | "markdown" | "text" | "tsx" | "typescript";

export interface AgentCodeToken {
  content: string;
  offset: number;
  light?: string;
  dark?: string;
}

export type AgentCodeTokenLines = AgentCodeToken[][];

export interface AgentCodeProps {
  code: string;
  language?: AgentCodeLanguage;
  className?: string;
}

export interface AgentCodeLineProps {
  code: string;
  tokens?: AgentCodeToken[];
  className?: string;
}

const LIGHT_THEME = "github-light-high-contrast";
const DARK_THEME = "github-dark-high-contrast";
let agentCodeHighlighter: Promise<HighlighterCore> | null = null;

// Only the grammars Basics renders, with the JavaScript regex engine: no Oniguruma WASM and no full language bundle.
const LANGUAGES: Record<Exclude<AgentCodeLanguage, "text">, () => Promise<LanguageInput>> = {
  bash: () => import("shiki/langs/bash.mjs"),
  diff: () => import("shiki/langs/diff.mjs"),
  json: () => import("shiki/langs/json.mjs"),
  markdown: () => import("shiki/langs/markdown.mjs"),
  tsx: () => import("shiki/langs/tsx.mjs"),
  typescript: () => import("shiki/langs/typescript.mjs"),
};
const tokenCache = new Map<string, AgentCodeTokenLines>();

function getAgentCodeHighlighter() {
  if (!agentCodeHighlighter) {
    // Shiki is heavy; it loads with the first highlighted block, not with the app.
    agentCodeHighlighter = Promise.all([import("shiki/core"), import("shiki/engine/javascript")]).then(
      ([{ createHighlighterCore }, { createJavaScriptRegexEngine }]) =>
        // Grammars load per language on first use (see useAgentCodeTokens).
        createHighlighterCore({
          themes: [import("shiki/themes/github-light-high-contrast.mjs"), import("shiki/themes/github-dark-high-contrast.mjs")],
          langs: [],
          engine: createJavaScriptRegexEngine({ forgiving: true }),
        }),
    );
  }
  return agentCodeHighlighter;
}

function tokenCacheKey(code: string, language: AgentCodeLanguage) {
  return `${language}\u0000${code}`;
}

export function useAgentCodeTokens(code: string, language: AgentCodeLanguage) {
  const key = tokenCacheKey(code, language);
  const cached = tokenCache.get(key);
  const [result, setResult] = useState<{
    key: string;
    code: string;
    language: AgentCodeLanguage;
    lines: AgentCodeTokenLines;
  } | null>(cached ? { key, code, language, lines: cached } : null);

  useEffect(() => {
    const current = tokenCache.get(key);
    if (current) {
      setResult({ key, code, language, lines: current });
      return;
    }

    let cancelled = false;
    getAgentCodeHighlighter()
      .then(async (highlighter) => {
        // Each grammar loads the first time a block uses it.
        if (language !== "text" && !highlighter.getLoadedLanguages().includes(language)) {
          await highlighter.loadLanguage(await LANGUAGES[language]());
        }
        return highlighter;
      })
      .then((highlighter) => {
        if (cancelled) return;
        const lines = highlighter
          .codeToTokensWithThemes(code, {
            lang: language,
            themes: {
              light: LIGHT_THEME,
              dark: DARK_THEME,
            },
          })
          .map((line) =>
            line.map((token) => ({
              content: token.content,
              offset: token.offset,
              light: token.variants.light?.color,
              dark: token.variants.dark?.color,
            })),
          );
        tokenCache.set(key, lines);
        setResult({ key, code, language, lines });
      });
    return () => {
      cancelled = true;
    };
  }, [code, key, language]);

  if (result?.key === key) return result.lines;
  if (result?.language === language && code.startsWith(result.code)) {
    return result.lines;
  }
  return null;
}

export function AgentCodeLine({ code, tokens, className }: AgentCodeLineProps) {
  return (
    <span className={className}>
      {tokens
        ? tokens.map((token) => (
            <span
              key={`${token.offset}-${token.content}`}
              style={
                {
                  "--agent-code-light": token.light ?? "currentColor",
                  "--agent-code-dark": token.dark ?? token.light ?? "currentColor",
                } as CSSProperties
              }
              className="text-[var(--agent-code-light)] dark:text-[var(--agent-code-dark)]"
            >
              {token.content}
            </span>
          ))
        : code}
    </span>
  );
}

export function AgentCode({ code, language = "bash", className }: AgentCodeProps) {
  const tokens = useAgentCodeTokens(code, language);
  let offset = 0;
  const lines = code.split("\n").map((content) => {
    const line = { content, offset };
    offset += content.length + 1;
    return line;
  });

  return (
    <pre className={cn("m-0 overflow-x-auto whitespace-pre font-mono text-xs leading-5 text-foreground/85", className)}>
      <code>
        {lines.map((line, index) => (
          <Fragment key={line.offset}>
            <AgentCodeLine code={line.content} tokens={tokens?.[index]} />
            {index < lines.length - 1 ? "\n" : null}
          </Fragment>
        ))}
      </code>
    </pre>
  );
}
