import type { NoteData, NoteType } from "@marcozvd/basics-core";
import { ChevronDown } from "lucide-react";
import { Fragment, useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/motion/collapsible";
import { type TranslationKey, useT } from "@/i18n";
import { FIELDS } from "@/lib/fields";
import { cn } from "@/lib/utils";
import { FieldInput } from "./field-input";

const META_KEYS = new Set(["type", "source", "updated"]);
const OPEN_KEY = "basics-editor-properties-open";

function readOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) !== "0";
  } catch {
    return true;
  }
}

export function NoteForm({
  type,
  data,
  onChange,
  errors,
}: {
  type: NoteType;
  data: NoteData;
  onChange: (data: NoteData) => void;
  errors: Record<string, string>;
}) {
  const t = useT();
  const [open, setOpen] = useState(readOpen);
  const fields = FIELDS[type].filter((field) => field.key !== "title");
  const record = data as NoteData & Record<string, unknown>;
  const known = new Set(FIELDS[type].map((field) => field.key));
  const extra = Object.keys(record).filter((key) => !known.has(key) && !META_KEYS.has(key));

  const updateOpen = (next: boolean) => {
    setOpen(next);
    try {
      localStorage.setItem(OPEN_KEY, next ? "1" : "0");
    } catch {
      // Private mode: the section simply reopens next time.
    }
  };

  return (
    <Collapsible open={open} onOpenChange={updateOpen}>
      <CollapsibleTrigger className="min-h-8 w-full justify-start gap-1 rounded-lg px-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase hover:bg-muted/40">
        <span aria-hidden="true" className="inline-flex size-3.5 shrink-0 items-center justify-center text-muted-foreground">
          <ChevronDown className={cn("size-3.5 transition-transform duration-200", !open && "-rotate-90")} />
        </span>
        {t("editor.properties")}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1.5 grid max-w-[720px] grid-cols-[132px_minmax(0,1fr)] items-start gap-x-3 gap-y-1 pb-2">
          {fields.map((field) => (
            <Fragment key={field.key}>
              <label htmlFor={`field-${field.key}`} className="truncate px-2 pt-1.5 text-[12px] leading-5 text-muted-foreground">
                {t(`field.${field.key}` as TranslationKey)}
              </label>
              <div className="min-w-0">
                <FieldInput
                  id={`field-${field.key}`}
                  field={field}
                  value={record[field.key]}
                  error={errors[field.key]}
                  onChange={(value) => onChange({ ...record, [field.key]: value } as NoteData)}
                />
              </div>
            </Fragment>
          ))}

          {extra.length > 0 ? (
            <>
              <div className="col-span-2 mt-2 px-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                {t("field.other")}
              </div>
              {extra.map((key) => (
                <Fragment key={key}>
                  <span className="truncate px-2 py-1 font-mono text-[11px] text-muted-foreground">{key}</span>
                  <span className="truncate px-2 py-1 font-mono text-[11px] text-muted-foreground">
                    {JSON.stringify(record[key]) ?? "undefined"}
                  </span>
                </Fragment>
              ))}
            </>
          ) : null}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
