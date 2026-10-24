import type { NoteSummary, NoteType } from "@marcozvd/basics-core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import {
  Fragment,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type Ref,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router";
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
import { ApiRequestError, createNote } from "@/lib/api";
import type { Field, TemplateOptions } from "@/lib/fields";
import { TEMPLATES } from "@/lib/fields";
import { useLayers, useNotes } from "@/lib/queries";
import { slugify } from "@/lib/slug";
import { toast } from "@/lib/toast";
import { tintStyle } from "@/lib/type-color";
import { cn } from "@/lib/utils";

const FIELD_CLASS = "h-7 rounded-lg border-transparent bg-transparent hover:border-border";
const AUTO_TEXTAREA_CLASS =
  "min-h-[26px] w-full resize-none overflow-hidden rounded-md border border-transparent bg-transparent px-2 py-1 text-[13px] leading-[18px] text-foreground outline-none transition-colors hover:border-border focus:border-foreground/40 focus:ring-2 focus:ring-ring/40";
const INPUT_CLASS = "px-2 text-[13px]";
// Empty values read as a muted dash until the control is focused.
const EMPTY_INPUT_CLASS = "placeholder:text-muted-foreground focus:placeholder:text-transparent";
const TRIGGER_CLASS = "min-h-7 rounded-lg border-transparent bg-transparent px-1.5 py-0 hover:border-border";
const CHIP_CLASS = "h-auto min-h-5 max-w-full items-start rounded-md bg-transparent px-1.5 py-0.5 text-[11px] font-medium";
const SEARCH_INPUT_CLASS = "h-5 text-[13px] placeholder:text-transparent focus:placeholder:text-muted-foreground";
const CREATE_VALUE = "__basics-create__";

const typeColor = (type: NoteType | undefined) => `var(--type-${type ?? "layer"})`;
const optionLabel = (t: ReturnType<typeof useT>, value: string) => t(`option.${value}` as TranslationKey);
const isCreateValue = (value: string) => value === CREATE_VALUE;

function linkItems(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value === "string" && value.trim()) return [value];
  return [];
}

function AutoGrowTextarea({
  textareaRef,
  id,
  value,
  onChange,
  ariaLabel,
  placeholder,
  className,
  onKeyDown,
}: {
  textareaRef?: Ref<HTMLTextAreaElement>;
  id?: string;
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  placeholder?: string;
  className?: string;
  onKeyDown?: (event: ReactKeyboardEvent<HTMLTextAreaElement>) => void;
}) {
  const localRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const textarea = localRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${textarea.scrollHeight}px`;
  });

  return (
    <textarea
      ref={(node) => {
        localRef.current = node;
        if (typeof textareaRef === "function") textareaRef(node);
        else if (textareaRef) (textareaRef as { current: HTMLTextAreaElement | null }).current = node;
      }}
      id={id}
      rows={1}
      value={value}
      aria-label={ariaLabel}
      placeholder={placeholder}
      wrap="soft"
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={onKeyDown}
      className={cn(AUTO_TEXTAREA_CLASS, className)}
    />
  );
}

export function LinkField({
  id,
  field,
  value,
  onChange,
  filter,
  createOptions,
}: {
  id: string;
  field: Field;
  value: unknown;
  onChange: (value: unknown) => void;
  /** Narrow the candidates, e.g. only `kind: language` techs. */
  filter?: (note: NoteSummary) => boolean;
  /** Template options used when the inline create action makes a note. */
  createOptions?: TemplateOptions;
}) {
  const t = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const notes = useNotes(field.linkType ? { type: field.linkType } : {});
  const values = linkItems(value);
  const label = t(`field.${field.key}` as TranslationKey);
  const candidates = (notes.data ?? []).filter((note) => !filter || filter(note));
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const addValue = (nextId: string) => {
    if (field.kind === "link") {
      onChange(nextId);
      return;
    }
    if (values.includes(nextId)) return;
    onChange([...values, nextId]);
  };

  const create = useMutation({
    mutationFn: ({ title, id: nextId }: { title: string; id: string }) => {
      const type = field.linkType;
      if (!type) throw new Error("This field cannot create notes");
      return createNote({ id: nextId, data: TEMPLATES[type]({ ...createOptions, title }), body: `# ${title}\n` });
    },
    onSuccess: (note, input) => {
      void queryClient.invalidateQueries({ queryKey: ["notes"] });
      addValue(note.id);
      toast.success(t("field.created", { title: input.title }), {
        label: t("field.open"),
        onClick: () => navigate(`/notes/${encodeURIComponent(note.id)}`),
      });
      requestAnimationFrame(() => inputRef.current?.focus());
    },
    onError: (error, input) => {
      if (error instanceof ApiRequestError && error.body.error === "exists") {
        addValue(input.id);
        void queryClient.invalidateQueries({ queryKey: ["notes"] });
      } else {
        toast.error(t("field.createFailed", { title: input.title }));
      }
      requestAnimationFrame(() => inputRef.current?.focus());
    },
  });

  const requested = query.trim();
  const requestedId = slugify(requested);
  const exactMatch = candidates.some(
    (note) => note.id.toLowerCase() === requested.toLowerCase() || (note.title || note.id).toLowerCase() === requested.toLowerCase(),
  );
  const showCreate = Boolean(field.linkType && requested && requestedId && !exactMatch);
  const createLabel = t("field.create", { title: requested });

  const createFromQuery = () => {
    const title = query.trim();
    const nextId = slugify(title);
    if (!title || !nextId || !field.linkType) return;
    const existing = candidates.find((note) => note.id === nextId);
    if (existing) {
      addValue(existing.id);
      setQuery("");
      requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }
    create.mutate({ title, id: nextId });
  };

  return (
    <MultiSelect
      value={values}
      query={query}
      onQueryChange={setQuery}
      onValueChange={(next) => {
        const plain = next.filter((item) => !isCreateValue(item));
        if (plain.length !== next.length) return;
        onChange(field.kind === "link" ? (plain.at(-1) ?? "") : plain);
      }}
    >
      <MultiSelectTrigger className={TRIGGER_CLASS}>
        <MultiSelectValue placeholder="—" chipClassName={CHIP_CLASS}>
          {(item) => {
            const target = notes.data?.find((note) => note.id === item);
            const missing = notes.data !== undefined && target === undefined;
            const color = missing ? "var(--destructive)" : typeColor(target?.type);
            return (
              <span
                className="flex min-h-5 min-w-0 max-w-full items-start gap-1.5 rounded-md px-1.5 py-0 font-mono"
                style={tintStyle(color)}
              >
                <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-current" />
                <span className="min-w-0 break-all">{item}</span>
              </span>
            );
          }}
        </MultiSelectValue>
        <MultiSelectInput ref={inputRef} id={id} aria-label={label} className={SEARCH_INPUT_CLASS} />
      </MultiSelectTrigger>
      <MultiSelectContent>
        <MultiSelectList>
          {candidates.map((note) => (
            <MultiSelectItem key={note.id} value={note.id} keywords={[note.title]}>
              <span className="flex min-w-0 items-center gap-1.5">
                <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: typeColor(note.type) }} />
                <span className="truncate">{note.title || note.id}</span>
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{note.id}</span>
              </span>
            </MultiSelectItem>
          ))}
          {showCreate ? (
            <MultiSelectItem
              value={CREATE_VALUE}
              textValue={createLabel}
              keywords={[requested, requestedId]}
              onSelect={createFromQuery}
              disabled={create.isPending}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: typeColor(field.linkType) }}
                />
                <span className="min-w-0 break-words">{createLabel}</span>
              </span>
            </MultiSelectItem>
          ) : null}
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
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const label = t(`field.${field.key}` as TranslationKey);

  const update = (index: number, next: string) => onChange(items.map((item, i) => (i === index ? next : item)));
  const remove = (index: number) => onChange(items.filter((_, i) => i !== index));
  const add = () => {
    const next = draft.trim();
    setDraft("");
    if (!next || items.includes(next)) return;
    onChange([...items, next]);
    requestAnimationFrame(() => draftRef.current?.focus());
  };

  return (
    <div className="group/list flex flex-col">
      {items.map((item, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: list items are positional while being edited.
        <div key={index} className="group flex items-start gap-1">
          <AutoGrowTextarea
            ariaLabel={label}
            value={item}
            onChange={(next) => update(index, next)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              event.currentTarget.blur();
              draftRef.current?.focus();
            }}
            className="flex-1"
          />
          <button
            type="button"
            aria-label={`${t("editor.delete")} ${item}`}
            onClick={() => remove(index)}
            className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring group-hover:opacity-100"
          >
            <X className="size-3" aria-hidden="true" />
          </button>
        </div>
      ))}
      {/* The add row always reserves its height so hovering never shifts the form; it only fades in on
          hover or focus (or while it holds a draft) and stays in the tab order. */}
      <div
        className={cn(
          "flex items-start gap-1",
          items.length > 0
            ? cn(
                "min-h-[26px] transition-opacity duration-150 group-focus-within/list:opacity-100 group-hover/list:opacity-100",
                draft ? "opacity-100" : "opacity-0",
              )
            : "min-h-7",
        )}
      >
        <AutoGrowTextarea
          textareaRef={draftRef}
          id={id}
          value={draft}
          ariaLabel={`${t("editor.addItem")} ${label}`}
          placeholder={items.length > 0 ? t("editor.addItem") : "—"}
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
          className={cn("flex-1", items.length > 0 && "border-dashed", items.length === 0 && EMPTY_INPUT_CLASS)}
        />
        <button
          type="button"
          aria-label={t("editor.addItem")}
          onClick={add}
          disabled={!draft.trim()}
          className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
        >
          <Plus className="size-3" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function TagsField({ id, field, value, onChange }: { id: string; field: Field; value: unknown; onChange: (value: unknown) => void }) {
  const t = useT();
  const tags = linkItems(value);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const label = t(`field.${field.key}` as TranslationKey);

  const commit = (raw: string) => {
    const next = raw
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag, index, all) => tag && !tags.includes(tag) && all.indexOf(tag) === index);
    setDraft("");
    if (next.length > 0) onChange([...tags, ...next]);
  };
  const remove = (tag: string) => {
    onChange(tags.filter((item) => item !== tag));
    inputRef.current?.focus();
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: clicking the empty area focuses the ghost input, which is keyboard reachable.
    // biome-ignore lint/a11y/useKeyWithClickEvents: same as above.
    <div
      onClick={(event) => {
        if (event.target === event.currentTarget) inputRef.current?.focus();
      }}
      className="flex min-h-7 cursor-text flex-wrap items-center gap-1 rounded-lg border border-transparent px-1.5 py-[3px] transition-colors hover:border-border focus-within:border-foreground/40 focus-within:ring-2 focus-within:ring-ring/40"
    >
      {tags.map((tag) => (
        <span
          key={tag}
          className="group inline-flex h-5 items-center gap-0.5 rounded-full border border-border bg-card px-2 font-mono transition-[padding] focus-within:pr-0.5 hover:pr-0.5 text-[12px] leading-none"
        >
          {tag}
          <button
            type="button"
            aria-label={`${t("editor.delete")} ${tag}`}
            onClick={() => remove(tag)}
            className="grid h-4 w-0 place-items-center overflow-hidden rounded-full text-muted-foreground opacity-0 transition-opacity group-focus-within:w-4 group-focus-within:opacity-100 group-hover:w-4 hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring group-hover:opacity-100"
          >
            <X className="size-2.5" aria-hidden="true" />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        id={id}
        value={draft}
        aria-label={`${t("editor.addItem")} ${label}`}
        placeholder={tags.length > 0 ? "" : "—"}
        onChange={(event) => {
          const next = event.target.value;
          if (next.includes(",")) commit(next);
          else setDraft(next);
        }}
        onBlur={() => commit(draft)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit(draft);
          } else if (event.key === "Backspace" && draft === "" && tags.length > 0) {
            event.preventDefault();
            onChange(tags.slice(0, -1));
          }
        }}
        className="h-5 min-w-16 flex-1 bg-transparent px-0.5 font-mono text-[12px] outline-none placeholder:font-sans placeholder:text-[13px] placeholder:text-muted-foreground focus:placeholder:text-transparent"
      />
    </div>
  );
}

function StackLayerRow({
  layer,
  title,
  ids,
  techs,
  autoFocus = false,
  onIdsChange,
  onRemove,
}: {
  layer: string;
  title: string;
  ids: string[];
  techs: NoteSummary[] | undefined;
  autoFocus?: boolean;
  onIdsChange: (ids: string[]) => void;
  onRemove: () => void;
}) {
  const t = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // A layer pill adds this row and puts the caret in its tech search, ready
  // for the first keystroke.
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const addValue = (nextId: string) => {
    if (ids.includes(nextId)) return;
    onIdsChange([...ids, nextId]);
  };

  const create = useMutation({
    mutationFn: ({ title: nextTitle, id: nextId }: { title: string; id: string }) =>
      createNote({
        id: nextId,
        data: TEMPLATES.tech({ title: nextTitle, layer }),
        body: `# ${nextTitle}\n`,
      }),
    onSuccess: (note, input) => {
      void queryClient.invalidateQueries({ queryKey: ["notes"] });
      addValue(note.id);
      toast.success(t("field.created", { title: input.title }), {
        label: t("field.open"),
        onClick: () => navigate(`/notes/${encodeURIComponent(note.id)}`),
      });
      requestAnimationFrame(() => inputRef.current?.focus());
    },
    onError: (error, input) => {
      if (error instanceof ApiRequestError && error.body.error === "exists") {
        addValue(input.id);
        void queryClient.invalidateQueries({ queryKey: ["notes"] });
      } else {
        toast.error(t("field.createFailed", { title: input.title }));
      }
      requestAnimationFrame(() => inputRef.current?.focus());
    },
  });

  const requested = query.trim();
  const requestedId = slugify(requested);
  const exactMatch = (techs ?? []).some(
    (tech) => tech.id.toLowerCase() === requested.toLowerCase() || (tech.title || tech.id).toLowerCase() === requested.toLowerCase(),
  );
  const showCreate = Boolean(requested && requestedId && !exactMatch);
  const createLabel = t("field.create", { title: requested });

  const createFromQuery = () => {
    const nextTitle = query.trim();
    const nextId = slugify(nextTitle);
    if (!nextTitle || !nextId) return;
    const existing = (techs ?? []).find((tech) => tech.id === nextId);
    if (existing) {
      addValue(existing.id);
      setQuery("");
      requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }
    create.mutate({ title: nextTitle, id: nextId });
  };

  return (
    <div className="flex items-start gap-1">
      <span className="mt-1.5 w-20 shrink-0 truncate font-mono text-[11px] text-muted-foreground">{title}</span>
      <div className="min-w-0 flex-1">
        <MultiSelect
          value={ids}
          query={query}
          onQueryChange={setQuery}
          onValueChange={(next) => {
            const plain = next.filter((item) => !isCreateValue(item));
            if (plain.length !== next.length) return;
            onIdsChange(plain);
          }}
        >
          <MultiSelectTrigger className={cn(TRIGGER_CLASS, "min-w-0")}>
            <MultiSelectValue placeholder="—" chipClassName={CHIP_CLASS}>
              {(item) => {
                const tech = techs?.find((note) => note.id === item);
                const missing = techs !== undefined && tech === undefined;
                const color = missing ? "var(--destructive)" : "var(--type-tech)";
                return (
                  <span
                    className="flex min-h-5 min-w-0 max-w-full items-start gap-1.5 rounded-md px-1.5 py-0 font-mono"
                    style={tintStyle(color)}
                  >
                    <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-current" />
                    <span className="min-w-0 break-all">{item}</span>
                  </span>
                );
              }}
            </MultiSelectValue>
            <MultiSelectInput ref={inputRef} aria-label={`${t("field.stack")} ${title}`} className={SEARCH_INPUT_CLASS} />
          </MultiSelectTrigger>
          <MultiSelectContent>
            <MultiSelectList>
              {(techs ?? []).map((tech) => (
                <MultiSelectItem key={tech.id} value={tech.id} keywords={[tech.title]}>
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: "var(--type-tech)" }} />
                    <span className="truncate">{tech.title || tech.id}</span>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{tech.id}</span>
                  </span>
                </MultiSelectItem>
              ))}
              {showCreate ? (
                <MultiSelectItem
                  value={CREATE_VALUE}
                  textValue={createLabel}
                  keywords={[requested, requestedId]}
                  onSelect={createFromQuery}
                  disabled={create.isPending}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: "var(--type-tech)" }} />
                    <span className="min-w-0 break-words">{createLabel}</span>
                  </span>
                </MultiSelectItem>
              ) : null}
              <MultiSelectEmpty>{t("palette.empty")}</MultiSelectEmpty>
            </MultiSelectList>
          </MultiSelectContent>
        </MultiSelect>
      </div>
      <button
        type="button"
        aria-label={`${t("editor.delete")} ${title}`}
        onClick={onRemove}
        className="mt-1 grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
      >
        <X className="size-3" aria-hidden="true" />
      </button>
    </div>
  );
}

export function StackField({ value, onChange }: { value: unknown; onChange: (value: unknown) => void }) {
  const t = useT();
  const layers = useLayers();
  const techs = useNotes({ type: "tech" });
  const stack = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, string[]>) : {};
  const [focusLayer, setFocusLayer] = useState<string | null>(null);

  const setLayer = (layer: string, next: string[]) => onChange({ ...stack, [layer]: next });
  const addLayer = (layer: string) => {
    if (!layer || layer in stack) return;
    onChange({ ...stack, [layer]: [] });
    setFocusLayer(layer);
  };
  const remaining = (layers.data ?? []).filter((layer) => !(layer.id in stack));

  return (
    <div className="flex flex-col gap-1">
      {Object.entries(stack).map(([layer, ids]) => (
        <StackLayerRow
          key={layer}
          layer={layer}
          title={layers.data?.find((item) => item.id === layer)?.title || layer}
          ids={Array.isArray(ids) ? ids : []}
          techs={techs.data}
          autoFocus={focusLayer === layer}
          onIdsChange={(next) => setLayer(layer, next)}
          onRemove={() => {
            const next = { ...stack };
            delete next[layer];
            onChange(next);
          }}
        />
      ))}
      {remaining.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1 pt-0.5">
          {remaining.map((layer) => (
            <button
              key={layer.id}
              type="button"
              onClick={() => addLayer(layer.id)}
              aria-label={t("editor.addLayerNamed", { title: layer.title || layer.id })}
              className="inline-flex h-6 items-center gap-1 rounded-full border border-dashed border-border px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:border-(--color-border-strong) hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
            >
              <Plus className="size-3" aria-hidden="true" />
              {layer.title || layer.id}
            </button>
          ))}
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
          <SelectTrigger className="h-7 w-full rounded-lg border-transparent bg-transparent px-2 text-[13px] hover:border-border">
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
      control =
        field.key === "tags" ? (
          <TagsField id={id} field={field} value={value} onChange={onChange} />
        ) : (
          <ListField id={id} field={field} value={value} onChange={onChange} />
        );
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
          placeholder="—"
          classNames={{ field: FIELD_CLASS, input: `${INPUT_CLASS} ${EMPTY_INPUT_CLASS}` }}
        />
      );
  }

  return (
    <Fragment>
      {control}
      {error ? (
        <p id={errorId} className="px-2 pb-1 text-[11px] text-destructive-text">
          {error}
        </p>
      ) : null}
    </Fragment>
  );
}
