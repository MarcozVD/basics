import { cn } from "cn";
import { Plus, X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { type TranslationKey, useT } from "@/i18n";
import type { Field } from "@/lib/fields";
import { useLayers, useNotes } from "@/lib/queries";

const optionLabel = (t: ReturnType<typeof useT>, value: string) => t(`option.${value}` as TranslationKey);

function noteIds(notes: { id: string }[] | undefined): Set<string> {
  return new Set((notes ?? []).map((note) => note.id));
}

// Existing notes may store a single link as a plain string; normalize only for display.
function linkItems(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value === "string" && value.trim()) return [value];
  return [];
}

function LinkField({
  id,
  field,
  value,
  onChange,
  invalid,
}: {
  id: string;
  field: Field;
  value: unknown;
  onChange: (value: unknown) => void;
  invalid: boolean;
}) {
  const t = useT();
  const notes = useNotes({ type: field.linkType ?? "tech" });
  const listId = `${id}-options`;
  const current = linkItems(value)[0] ?? "";
  const broken = current.length > 0 && notes.data !== undefined && !noteIds(notes.data).has(current);

  return (
    <>
      <Input
        id={id}
        list={listId}
        value={current}
        aria-invalid={invalid}
        onChange={(event) => onChange(event.target.value)}
        className={cn(broken && "text-amber-700 dark:text-amber-400")}
      />
      <datalist id={listId}>
        {notes.data?.map((note) => (
          <option key={note.id} value={note.id}>
            {note.title}
          </option>
        ))}
      </datalist>
      {broken && <p className="text-xs text-amber-700 dark:text-amber-400">{t("editor.brokenLink", { id: current })}</p>}
    </>
  );
}

function LinksField({
  id,
  field,
  value,
  onChange,
  invalid,
}: {
  id: string;
  field: Field;
  value: unknown;
  onChange: (value: unknown) => void;
  invalid: boolean;
}) {
  const t = useT();
  const notes = useNotes({ type: field.linkType ?? "tech" });
  const listId = `${id}-options`;
  const [draft, setDraft] = useState("");
  const items = linkItems(value);
  const known = noteIds(notes.data);

  const add = () => {
    const next = draft.trim();
    setDraft("");
    if (!next || items.includes(next)) return;
    onChange([...items, next]);
  };

  const remove = (item: string) => onChange(items.filter((entry) => entry !== item));

  return (
    <div className="flex flex-col gap-1.5">
      <Input
        id={id}
        list={listId}
        value={draft}
        aria-invalid={invalid}
        placeholder={t("field.linksPlaceholder")}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          add();
        }}
      />
      <datalist id={listId}>
        {notes.data?.map((note) => (
          <option key={note.id} value={note.id}>
            {note.title}
          </option>
        ))}
      </datalist>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {items.map((item) => {
            const broken = notes.data !== undefined && !known.has(item);
            return (
              <Badge
                key={item}
                variant="outline"
                className={cn(
                  "max-w-full gap-1 font-mono text-[11px]",
                  broken && "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400",
                )}
              >
                <span className="truncate">{item}</span>
                <button
                  type="button"
                  aria-label={`${t("editor.delete")} ${item}`}
                  className="rounded-full hover:bg-muted"
                  onClick={() => remove(item)}
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
}

function parseTechList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

interface StackRow {
  key: string;
  layer: string;
  techs: string;
}

function rowsFromValue(value: unknown, nextKey: () => string): StackRow[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>).map(([layer, ids]) => ({
    key: nextKey(),
    layer,
    techs: Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string").join(", ") : "",
  }));
}

function rowsToValue(rows: StackRow[]): Record<string, string[]> {
  const stack: Record<string, string[]> = {};
  for (const row of rows) stack[row.layer] = parseTechList(row.techs);
  return stack;
}

function StackField({
  id,
  value,
  onChange,
  invalid,
}: {
  id: string;
  value: unknown;
  onChange: (value: unknown) => void;
  invalid: boolean;
}) {
  const t = useT();
  const layers = useLayers();
  const techs = useNotes({ type: "tech" });
  const layerListId = `${id}-layers`;
  const techListId = `${id}-techs`;
  const counter = useRef(0);
  const [rows, setRows] = useState<StackRow[]>(() => rowsFromValue(value, () => `stack-row-${counter.current++}`));
  const lastEmitted = useRef(JSON.stringify(value ?? {}));

  useEffect(() => {
    const serialized = JSON.stringify(value ?? {});
    if (serialized === lastEmitted.current) return;
    setRows(rowsFromValue(value, () => `stack-row-${counter.current++}`));
    lastEmitted.current = serialized;
  }, [value]);

  const emit = (next: StackRow[]) => {
    setRows(next);
    const record = rowsToValue(next);
    lastEmitted.current = JSON.stringify(record);
    onChange(record);
  };

  const updateRow = (key: string, patch: Partial<StackRow>) => {
    emit(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-col gap-1.5">
        {rows.map((row) => (
          <div key={row.key} className="flex flex-col gap-1 rounded-md border p-1.5">
            <div className="flex items-center gap-1">
              <Input
                list={layerListId}
                value={row.layer}
                aria-invalid={invalid}
                aria-label={t("field.layer")}
                placeholder={t("field.layer")}
                className="h-7 font-mono text-xs"
                onChange={(event) => updateRow(row.key, { layer: event.target.value })}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`${t("editor.delete")} ${row.layer}`}
                onClick={() => emit(rows.filter((item) => item.key !== row.key))}
              >
                <X aria-hidden="true" />
              </Button>
            </div>
            <Input
              list={techListId}
              value={row.techs}
              aria-invalid={invalid}
              aria-label={t("type.tech")}
              placeholder={t("type.tech")}
              className="h-7 font-mono text-xs"
              onChange={(event) => updateRow(row.key, { techs: event.target.value })}
            />
          </div>
        ))}
      </div>
      <datalist id={layerListId}>
        {layers.data?.map((layer) => (
          <option key={layer.id} value={layer.id}>
            {layer.title}
          </option>
        ))}
      </datalist>
      <datalist id={techListId}>
        {techs.data?.map((tech) => (
          <option key={tech.id} value={tech.id}>
            {tech.title}
          </option>
        ))}
      </datalist>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => {
          if (rows.some((row) => row.layer === "")) return;
          emit([...rows, { key: `stack-row-${counter.current++}`, layer: "", techs: "" }]);
        }}
      >
        <Plus aria-hidden="true" />
        {t("field.addStackRow")}
      </Button>
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
  const listText = Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").join("\n") : "";

  let control: ReactNode;
  switch (field.kind) {
    case "textarea":
      control = (
        <Textarea
          id={id}
          value={typeof value === "string" ? value : ""}
          aria-invalid={invalid}
          aria-describedby={invalid ? errorId : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      );
      break;
    case "enum":
      control = (
        <Select value={typeof value === "string" ? value : ""} onValueChange={onChange}>
          <SelectTrigger id={id} className="w-full" aria-invalid={invalid} aria-describedby={invalid ? errorId : undefined}>
            <SelectValue />
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
    case "list":
      control = (
        <Textarea
          id={id}
          value={listText}
          aria-invalid={invalid}
          aria-describedby={invalid ? errorId : undefined}
          onChange={(event) =>
            onChange(
              event.target.value
                .split("\n")
                .map((item) => item.trim())
                .filter(Boolean),
            )
          }
        />
      );
      break;
    case "links":
      control = <LinksField id={id} field={field} value={value} onChange={onChange} invalid={invalid} />;
      break;
    case "link":
      control = <LinkField id={id} field={field} value={value} onChange={onChange} invalid={invalid} />;
      break;
    case "stack":
      control = <StackField id={id} value={value} onChange={onChange} invalid={invalid} />;
      break;
    default:
      control = (
        <Input
          id={id}
          value={typeof value === "string" ? value : ""}
          aria-invalid={invalid}
          aria-describedby={invalid ? errorId : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {control}
      {error && (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
