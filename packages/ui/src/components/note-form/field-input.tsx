import type { NoteType } from "@marcozvd/basics-core";
import { Plus, X } from "lucide-react";
import { Fragment, type ReactNode, useState } from "react";
import { Input } from "@/components/motion/input";
import {
  MultiSelect,
  MultiSelectContent,
  MultiSelectEmpty,
  MultiSelectInput,
  MultiSelectItem,
  MultiSelectList,
  MultiSelectTrigger,
  MultiSelectValue,
} from "@/components/motion/multi-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/motion/select";
import { type TranslationKey, useT } from "@/i18n";
import type { Field } from "@/lib/fields";
import { useLayers, useNotes } from "@/lib/queries";

const FIELD_CLASS = "h-8 rounded-lg border-transparent bg-transparent hover:border-border";
const INPUT_CLASS = "px-2 text-[13px]";
const TRIGGER_CLASS = "min-h-8 rounded-lg border-transparent bg-transparent px-1.5 py-0.5 hover:border-border";

const typeColor = (type: NoteType | undefined) => `var(--type-${type ?? "layer"})`;
const optionLabel = (t: ReturnType<typeof useT>, value: string) => t(`option.${value}` as TranslationKey);

function linkItems(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value === "string" && value.trim()) return [value];
  return [];
}

function LinkField({ id, field, value, onChange }: { id: string; field: Field; value: unknown; onChange: (value: unknown) => void }) {
  const t = useT();
  const notes = useNotes(field.linkType ? { type: field.linkType } : {});
  const values = linkItems(value);
  const label = t(`field.${field.key}` as TranslationKey);

  return (
    <MultiSelect value={values} onValueChange={(next) => onChange(field.kind === "link" ? (next.at(-1) ?? "") : next)}>
      <MultiSelectTrigger className={TRIGGER_CLASS}>
        <MultiSelectValue
          placeholder={t("field.linksPlaceholder")}
          chipClassName="h-6 gap-1 rounded-md bg-transparent p-0 text-[11px] font-medium"
        >
          {(item) => {
            const target = notes.data?.find((note) => note.id === item);
            const missing = notes.data !== undefined && target === undefined;
            const color = missing ? "var(--destructive)" : typeColor(target?.type);
            return (
              <span
                className="flex h-6 items-center gap-1.5 rounded-md px-1.5 font-mono"
                style={{ backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`, color }}
              >
                <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current" />
                {item}
              </span>
            );
          }}
        </MultiSelectValue>
        <MultiSelectInput id={id} aria-label={label} className="h-6 text-[13px]" />
      </MultiSelectTrigger>
      <MultiSelectContent>
        <MultiSelectList>
          {(notes.data ?? []).map((note) => (
            <MultiSelectItem key={note.id} value={note.id} keywords={[note.title]}>
              <span className="flex min-w-0 items-center gap-1.5">
                <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: typeColor(note.type) }} />
                <span className="truncate">{note.title || note.id}</span>
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{note.id}</span>
              </span>
            </MultiSelectItem>
          ))}
          <MultiSelectEmpty>{t("palette.empty")}</MultiSelectEmpty>
        </MultiSelectList>
      </MultiSelectContent>
    </MultiSelect>
  );
}

function ListField({ id, field, value, onChange }: { id: string; field: Field; value: unknown; onChange: (value: unknown) => void }) {
  const t = useT();
  const items = linkItems(value);
  const [draft, setDraft] = useState("");
  const label = t(`field.${field.key}` as TranslationKey);

  const update = (index: number, next: string) => onChange(items.map((item, i) => (i === index ? next : item)));
  const remove = (index: number) => onChange(items.filter((_, i) => i !== index));
  const add = () => {
    const next = draft.trim();
    setDraft("");
    if (!next || items.includes(next)) return;
    onChange([...items, next]);
  };

  return (
    <div className="flex flex-col gap-0.5">
      {items.map((item, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: list items are positional while being edited.
        <div key={index} className="group flex items-center gap-1">
          <Input
            aria-label={label}
            value={item}
            onChange={(next) => update(index, next)}
            classNames={{ root: "flex-1", field: FIELD_CLASS, input: INPUT_CLASS }}
          />
          <button
            type="button"
            aria-label={`${t("editor.delete")} ${item}`}
            onClick={() => remove(index)}
            className="grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring group-hover:opacity-100"
          >
            <X className="size-3" aria-hidden="true" />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-1">
        <Input
          id={id}
          value={draft}
          aria-label={`${t("editor.addItem")} ${label}`}
          placeholder={t("editor.addItem")}
          onChange={setDraft}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            } else if (event.key === "Backspace" && draft === "" && items.length > 0) {
              event.preventDefault();
              remove(items.length - 1);
            }
          }}
          classNames={{ root: "flex-1", field: `${FIELD_CLASS} border-dashed`, input: INPUT_CLASS }}
        />
        <button
          type="button"
          aria-label={t("editor.addItem")}
          onClick={add}
          disabled={!draft.trim()}
          className="grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
        >
          <Plus className="size-3" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function StackField({ value, onChange }: { value: unknown; onChange: (value: unknown) => void }) {
  const t = useT();
  const layers = useLayers();
  const techs = useNotes({ type: "tech" });
  const stack = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, string[]>) : {};
  const label = t("field.stack");

  const setLayer = (layer: string, next: string[]) => onChange({ ...stack, [layer]: next });
  const addLayer = (layer: string) => {
    if (!layer || layer in stack) return;
    onChange({ ...stack, [layer]: [] });
  };
  const remaining = (layers.data ?? []).filter((layer) => !(layer.id in stack));

  return (
    <div className="flex flex-col gap-1">
      {Object.entries(stack).map(([layer, ids]) => (
        <div key={layer} className="flex items-start gap-1">
          <span className="mt-1.5 w-20 shrink-0 truncate font-mono text-[11px] text-muted-foreground">
            {layers.data?.find((item) => item.id === layer)?.title ?? layer}
          </span>
          <div className="min-w-0 flex-1">
            <MultiSelect value={Array.isArray(ids) ? ids : []} onValueChange={(next) => setLayer(layer, next)}>
              <MultiSelectTrigger className={TRIGGER_CLASS}>
                <MultiSelectValue
                  placeholder={t("type.tech")}
                  chipClassName="h-6 gap-1 rounded-md bg-transparent p-0 text-[11px] font-medium"
                >
                  {(item) => {
                    const tech = techs.data?.find((note) => note.id === item);
                    const missing = techs.data !== undefined && tech === undefined;
                    const color = missing ? "var(--destructive)" : "var(--type-tech)";
                    return (
                      <span
                        className="flex h-6 items-center gap-1.5 rounded-md px-1.5 font-mono"
                        style={{ backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`, color }}
                      >
                        <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current" />
                        {item}
                      </span>
                    );
                  }}
                </MultiSelectValue>
                <MultiSelectInput aria-label={`${label} ${layer}`} className="h-6 text-[13px]" />
              </MultiSelectTrigger>
              <MultiSelectContent>
                <MultiSelectList>
                  {(techs.data ?? []).map((tech) => (
                    <MultiSelectItem key={tech.id} value={tech.id} keywords={[tech.title]}>
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span
                          aria-hidden="true"
                          className="size-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: "var(--type-tech)" }}
                        />
                        <span className="truncate">{tech.title || tech.id}</span>
                        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{tech.id}</span>
                      </span>
                    </MultiSelectItem>
                  ))}
                  <MultiSelectEmpty>{t("palette.empty")}</MultiSelectEmpty>
                </MultiSelectList>
              </MultiSelectContent>
            </MultiSelect>
          </div>
          <button
            type="button"
            aria-label={`${t("editor.delete")} ${layer}`}
            onClick={() => {
              const next = { ...stack };
              delete next[layer];
              onChange(next);
            }}
            className="mt-1 grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
          >
            <X className="size-3" aria-hidden="true" />
          </button>
        </div>
      ))}
      {remaining.length > 0 ? (
        <div className="w-40">
          <Select value="" onValueChange={addLayer}>
            <SelectTrigger className="h-8 rounded-lg border-dashed bg-transparent px-2 text-xs">
              <SelectValue placeholder={t("editor.addLayer")} />
            </SelectTrigger>
            <SelectContent>
              {remaining.map((layer) => (
                <SelectItem key={layer.id} value={layer.id}>
                  {layer.title || layer.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
    </div>
  );
}

export function FieldInput({
  id,
  field,
  value,
  onChange,
  error,
}: {
  id: string;
  field: Field;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string;
}) {
  const t = useT();
  const invalid = Boolean(error);
  const label = t(`field.${field.key}` as TranslationKey);
  const errorId = `${id}-error`;

  let control: ReactNode;
  switch (field.kind) {
    case "enum":
      control = (
        <Select value={typeof value === "string" ? value : ""} onValueChange={onChange}>
          <SelectTrigger className="h-8 w-full rounded-lg border-transparent bg-transparent px-2 text-[13px] hover:border-border">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {field.options?.map((option) => (
              <SelectItem key={option} value={option}>
                {optionLabel(t, option)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
      break;
    case "links":
    case "link":
      control = <LinkField id={id} field={field} value={value} onChange={onChange} />;
      break;
    case "list":
      control = <ListField id={id} field={field} value={value} onChange={onChange} />;
      break;
    case "stack":
      control = <StackField value={value} onChange={onChange} />;
      break;
    default:
      control = (
        <Input
          id={id}
          value={typeof value === "string" ? value : ""}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
          onChange={onChange}
          aria-label={label}
          classNames={{ field: FIELD_CLASS, input: INPUT_CLASS }}
        />
      );
  }

  return (
    <Fragment>
      {control}
      {error ? (
        <p id={errorId} className="px-2 pb-1 text-[11px] text-destructive">
          {error}
        </p>
      ) : null}
    </Fragment>
  );
}
