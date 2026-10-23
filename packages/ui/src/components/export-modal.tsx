import type { ExportFile, ExportTarget } from "@marcozvd/basics-core";
import { Copy, Download } from "lucide-react";
import { useEffect, useState } from "react";
import { CodeBlock } from "@/components/agents/code-block";
import { Button } from "@/components/motion/button/base";
import { CenterMorphModal, CenterMorphModalContent } from "@/components/motion/center-morph-modal";
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
import { useT } from "@/i18n";
import { toast } from "@/lib/toast";

export const EXPORT_TABS = [
  { value: "stack", path: "STACK.md", label: "STACK.md" },
  { value: "agents", path: "AGENTS.md", label: "AGENTS.md" },
  { value: "claude", path: "CLAUDE.md", label: "CLAUDE.md" },
  { value: "cursor", path: ".cursor/rules/stack.mdc", label: "Cursor" },
] as const;
export const EXPORT_TARGETS: ExportTarget[] = ["agents", "claude", "cursor"];

const BLOCK_START = "<!-- basics:start -->";
const BLOCK_END = "<!-- basics:end -->";

/** The managed block of an agent file, without the user's surrounding text. */
function markedBlock(content: string): string {
  const start = content.indexOf(BLOCK_START);
  const end = start >= 0 ? content.indexOf(BLOCK_END, start + BLOCK_START.length) : -1;
  return start >= 0 && end >= 0 ? content.slice(start, end + BLOCK_END.length) : content;
}

function fileBasename(filePath: string): string {
  return filePath.split("/").pop() ?? filePath;
}

interface ExportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  files: ExportFile[];
  stackIds: string[];
  /** Controlled tab, when the caller remembers the last tab. */
  tab?: string;
  onTabChange?: (value: string) => void;
}

/** Shared export preview used by Recommend and the Projects detail panel. */
export function ExportModal({ open, onOpenChange, files, stackIds, tab, onTabChange }: ExportModalProps) {
  const t = useT();
  const [internalTab, setInternalTab] = useState("stack");
  const controlled = tab !== undefined;
  const activeTab = controlled ? tab : internalTab;

  useEffect(() => {
    if (open && !controlled) setInternalTab("stack");
  }, [open, controlled]);

  const setTab = (value: string) => {
    if (controlled) onTabChange?.(value);
    else setInternalTab(value);
  };

  const selectedTab = EXPORT_TABS.find((item) => item.value === activeTab) ?? EXPORT_TABS[0];
  const activeFile = files.find((file) => file.path === selectedTab.path) ?? files[0];
  const blockOnly = selectedTab.value === "agents" || selectedTab.value === "claude";
  const content = blockOnly ? markedBlock(activeFile?.content ?? "") : (activeFile?.content ?? "");
  const filename = activeFile ? fileBasename(activeFile.path) : "STACK.md";
  const cli = `basics export --stack ${stackIds.join(",")} --targets ${EXPORT_TARGETS.join(",")}`;

  const copyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t("recommend.copied"));
    } catch {
      toast.error(t("recommend.copyFailed"));
    }
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([content], { type: "text/markdown" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <CenterMorphModal open={open} onOpenChange={onOpenChange}>
      <CenterMorphModalContent
        ariaLabel={t("recommend.dialog.title")}
        closeButtonLabel={t("recommend.close")}
        className="max-h-[86dvh] max-w-[860px] overflow-y-auto p-5"
      >
        <h2 className="font-mono text-base font-semibold tracking-tight">{t("recommend.dialog.title")}</h2>
        <p className="mt-0.5 pr-10 text-[13px] text-muted-foreground">{t("recommend.dialog.description")}</p>

        <Tabs value={activeTab} onValueChange={setTab} variant="segment" className="mt-4">
          <TabsList aria-label={t("recommend.exportFiles")}>
            {EXPORT_TABS.map((item) => (
              <TabsTrigger key={item.value} value={item.value} className="px-2 py-1 text-xs sm:px-3">
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <CodeBlock
          code={content}
          language="markdown"
          filename={filename}
          showStatus={false}
          copyable={false}
          showLineNumbers
          wrap
          maxHeight="54dvh"
          className="mt-2"
        />

        {blockOnly ? <p className="mt-2 text-[11px] text-muted-foreground">{t("recommend.mergeHint")}</p> : null}

        <div className="mt-3 flex min-w-0 items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md bg-muted/70 px-2 py-1 font-mono text-[10.5px] text-muted-foreground">
            {cli}
          </code>
          <button
            type="button"
            aria-label={t("recommend.copyCli")}
            title={t("recommend.copyCli")}
            onClick={() => void copyText(cli)}
            className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <Copy className="size-3.5" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" size="sm" pressScale={0.97} onClick={() => void copyText(content)}>
            {blockOnly ? t("recommend.copyBlock") : t("recommend.copy")}
          </Button>
          {blockOnly ? null : (
            <Button size="sm" pressScale={0.97} onClick={download}>
              <Download className="size-3.5" aria-hidden="true" />
              {t("recommend.download")}
            </Button>
          )}
        </div>
      </CenterMorphModalContent>
    </CenterMorphModal>
  );
}
