import type { NoteType } from "@marcozvd/basics-core";
import { cloneElement, type ReactElement, useEffect, useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/motion/popover";
import { type TranslationKey, useT } from "@/i18n";
import { useNote, useNotes } from "@/lib/queries";
import { tintStyle } from "@/lib/type-color";

const TYPE_COLOR = (type: NoteType | undefined) => `var(--type-${type ?? "layer"})`;

export function TypeDot({ type, className }: { type: NoteType | undefined; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`size-1.5 shrink-0 rounded-full ${className ?? ""}`}
      style={{ backgroundColor: TYPE_COLOR(type) }}
    />
  );
}

export function TypeChip({ type }: { type: NoteType | undefined }) {
  const t = useT();
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium" style={tintStyle(TYPE_COLOR(type))}>
      <TypeDot type={type} />
      {t(`type.${type ?? "layer"}` as TranslationKey)}
    </span>
  );
}

function excerpt(body: string): string {
  return body
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_`>#-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function PreviewCard({ id, open }: { id: string; open: boolean }) {
  const note = useNote(open ? id : undefined);
  const summary = useNotes().data?.find((item) => item.id === id);
  const t = useT();
  const title = note.data?.data.title ?? summary?.title ?? id;
  const type = note.data?.type ?? summary?.type;
  const text = note.data ? excerpt(note.data.body) : "";

  return (
    <div className="flex flex-col gap-1.5">
      <span className="truncate text-sm font-semibold tracking-tight">{title}</span>
      <div className="flex items-center gap-2">
        <TypeChip type={type} />
        <span className="truncate font-mono text-[10px] text-muted-foreground">{id}</span>
      </div>
      <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">{text || (note.isPending ? t("state.loading") : "")}</p>
    </div>
  );
}

/** Hover a note link: the preview card opens after 300ms. */
export function NotePreview({ id, children }: { id: string; children: ReactElement }) {
  const notes = useNotes();
  const known = notes.data?.some((note) => note.id === id) ?? false;
  const [open, setOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  if (!known) return children;

  const schedule = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(true), 300);
  };
  const cancel = () => {
    window.clearTimeout(timer.current);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen} side="top" align="start" sideOffset={8} panelRadius={14}>
      <PopoverTrigger>
        {cloneElement(children as ReactElement<Record<string, unknown>>, {
          onPointerEnter: schedule,
          onPointerLeave: cancel,
          onFocus: schedule,
          onBlur: cancel,
        })}
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3">
        <PreviewCard id={id} open={open} />
      </PopoverContent>
    </Popover>
  );
}
