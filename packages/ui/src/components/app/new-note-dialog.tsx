"use client";

import type { NoteData, NoteSummary, NoteType } from "@marcozvd/basics-core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { type ComponentProps, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/motion/button/base";
import { CenterMorphModal, CenterMorphModalContent } from "@/components/motion/center-morph-modal";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/motion/collapsible";
import { Input } from "@/components/motion/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
import { LinkField, StackField } from "@/components/note-form/field-input";
import { type TranslationKey, useT } from "@/i18n";
import { ApiRequestError, createNote } from "@/lib/api";
import { type Field, TEMPLATES } from "@/lib/fields";
import { queryKeys, useLayers } from "@/lib/queries";
import { useReturnFocus } from "@/lib/return-focus";
import { slugify } from "@/lib/slug";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const TYPE_ORDER: NoteType[] = ["tech", "practice", "check", "profile", "project", "layer"];
const TECH_KINDS = ["language", "framework", "library", "tool", "service", "database"] as const;
const CHECK_KINDS = ["test", "lint", "review", "build"] as const;
const PROJECT_STATUSES = ["active", "paused", "archived"] as const;
const MORE_KEY = "basics:new-note-more";
type TechKind = (typeof TECH_KINDS)[number];
type CheckKind = (typeof CHECK_KINDS)[number];
type ProjectStatus = (typeof PROJECT_STATUSES)[number];

const LANGUAGE_FIELD: Field = { key: "language", kind: "link", linkType: "tech" };
const APPLIES_TO_FIELD: Field = { key: "applies_to", kind: "links", linkType: "tech" };
const PROFILE_FIELD: Field = { key: "profile", kind: "link", linkType: "profile" };

interface NewNoteDetail {
  id?: string;
  type?: NoteType;
  /** Caller that opened the dialog, so creation can return to that screen. */
  from?: "projects";
}

const one = (value: string) => (value.trim() ? [value.trim()] : []);

function readMoreOpen() {
  try {
    return localStorage.getItem(MORE_KEY) === "1";
  } catch {
    return false;
  }
}

function DialogField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="px-0 text-xs font-normal text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function DialogInput({
  id,
  label,
  value,
  placeholder,
  mono = false,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  mono?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Input
      id={id}
      label={label}
      value={value}
      placeholder={placeholder}
      onChange={onChange}
      classNames={{
        label: "px-0 text-xs font-normal text-muted-foreground",
        field: "h-9 rounded-xl",
        input: cn("text-[13px]", mono && "font-mono"),
      }}
    />
  );
}

function DialogTextarea({
  id,
  label,
  value,
  placeholder,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="px-0 text-xs font-normal text-muted-foreground">
        {label}
      </label>
      <textarea
        id={id}
        rows={2}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-16 w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-[13px] leading-5 text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-foreground/40 focus:ring-2 focus:ring-ring/40"
      />
    </div>
  );
}

function PillGroup<T extends string>({
  labelId,
  label,
  value,
  options,
  onChange,
}: {
  labelId: string;
  label: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
}) {
  const t = useT();
  return (
    <div className="flex flex-col gap-1.5">
      <span id={labelId} className="text-xs text-muted-foreground">
        {label}
      </span>
      <Tabs value={value} onValueChange={(next) => onChange(next as T)} variant="pill">
        <TabsList aria-labelledby={labelId} className="flex-wrap bg-background">
          {options.map((option) => (
            <TabsTrigger key={option} value={option} className="px-2.5 py-1 text-[12px]">
              {t(`option.${option}` as TranslationKey)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}

function DialogLinkField({ label, id, ...linkProps }: { label: string; id: string } & Omit<ComponentProps<typeof LinkField>, "id">) {
  return (
    <DialogField label={label}>
      <LinkField id={id} {...linkProps} />
    </DialogField>
  );
}

/**
 * Mounted once in the layout; opens on the `basics:new-note` event (dock palette, Explore).
 * Type and layer are pill segments rather than dropdowns; relation fields reuse the
 * editor's LinkField/StackField so their portalled panels keep working inside the modal.
 */
export function NewNoteDialog() {
  const t = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const layers = useLayers();
  const typeLabelId = useId();
  const techKindLabelId = useId();
  const checkKindLabelId = useId();
  const statusLabelId = useId();
  const layersLabelId = useId();
  const descriptionId = useId();
  const titleRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState<NewNoteDetail["from"]>();
  const [type, setType] = useState<NoteType>("tech");
  const [title, setTitle] = useState("");
  const [id, setId] = useState("");
  const [idEdited, setIdEdited] = useState(false);
  const [techKind, setTechKind] = useState<TechKind>("framework");
  const [checkKind, setCheckKind] = useState<CheckKind>("test");
  const [selectedLayers, setSelectedLayers] = useState<string[]>([]);
  const [useWhen, setUseWhen] = useState("");
  const [avoidWhen, setAvoidWhen] = useState("");
  const [version, setVersion] = useState("");
  const [language, setLanguage] = useState("");
  const [description, setDescription] = useState("");
  const [projectPath, setProjectPath] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("active");
  const [profile, setProfile] = useState("");
  const [stack, setStack] = useState<Record<string, string[]>>({});
  const [appliesTo, setAppliesTo] = useState<string[]>([]);
  const [rule, setRule] = useState("");
  const [command, setCommand] = useState("");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [moreOpen, setMoreOpen] = useState(readMoreOpen);
  const [error, setError] = useState("");
  // Opening before the layer query resolves must still default the tech layer.
  const awaitingDefaultLayer = useRef(false);
  useReturnFocus(open);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => titleRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const create = useMutation({
    mutationFn: (input: { id: string; data: NoteData; body: string }) => createNote(input),
    onSuccess: (note) => {
      void queryClient.invalidateQueries({ queryKey: ["notes"] });
      if (from === "projects") {
        // The Projects page selects `?p=` from its notes query; seed the new row
        // so it can be selected before the invalidation refetch lands.
        const summary: NoteSummary = {
          id: note.id,
          type: note.type,
          title: note.data.title || note.id,
          layers: note.data.type === "tech" ? [note.data.layer].flat() : [],
          kind: note.data.type === "tech" ? note.data.kind : undefined,
          source: note.data.source,
          tags: note.data.tags ?? [],
          project: note.data.type === "project" ? note.data : undefined,
        };
        queryClient.setQueryData<NoteSummary[]>(queryKeys.notes({}), (current) =>
          current?.some((item) => item.id === note.id) ? current : [...(current ?? []), summary],
        );
      }
      setOpen(false);
      navigate(from === "projects" ? `/projects?p=${encodeURIComponent(note.id)}` : `/notes/${encodeURIComponent(note.id)}`);
    },
    onError: (mutationError) => {
      if (mutationError instanceof ApiRequestError && mutationError.body.error === "exists") {
        setError(t("new.exists"));
        return;
      }
      setError(mutationError instanceof Error && mutationError.message ? mutationError.message : t("new.failed"));
      toast.error(t("new.failed"));
    },
  });

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<NewNoteDetail | undefined>).detail;
      const requestedId = detail?.id?.trim() ?? "";
      const requestedType = detail?.type && TYPE_ORDER.includes(detail.type) ? detail.type : "tech";
      setType(requestedType);
      setTitle(requestedId);
      setId(requestedId);
      setIdEdited(Boolean(requestedId));
      setTechKind("framework");
      setCheckKind("test");
      const defaultLayer = layers.data?.[0]?.id;
      awaitingDefaultLayer.current = !defaultLayer;
      setSelectedLayers(defaultLayer ? [defaultLayer] : []);
      setUseWhen("");
      setAvoidWhen("");
      setVersion("");
      setLanguage("");
      setDescription("");
      setProjectPath("");
      setStatus("active");
      setProfile("");
      setStack({});
      setAppliesTo([]);
      setRule("");
      setCommand("");
      setSince("");
      setUntil("");
      setError("");
      setFrom(detail?.from);
      setOpen(true);
    };
    window.addEventListener("basics:new-note", onOpen);
    return () => window.removeEventListener("basics:new-note", onOpen);
  }, [layers.data]);

  useEffect(() => {
    if (!open || !awaitingDefaultLayer.current) return;
    const first = layers.data?.[0]?.id;
    if (!first) return;
    awaitingDefaultLayer.current = false;
    setSelectedLayers([first]);
  }, [open, layers.data]);

  const updateMore = (next: boolean) => {
    setMoreOpen(next);
    try {
      localStorage.setItem(MORE_KEY, next ? "1" : "0");
    } catch {
      // Private mode: the section reopens from its default next time.
    }
  };

  const typeLabel = (value: NoteType) => t(`type.${value}` as TranslationKey);
  const toggleLayer = (value: string) => {
    setSelectedLayers((current) => (current.includes(value) ? current.filter((item) => item !== value) : [...current, value]));
  };

  const trimmedTitle = title.trim();
  const slug = slugify(id);
  const canCreate = Boolean(trimmedTitle && slug) && (type !== "tech" || selectedLayers.length > 0);

  const buildData = (): NoteData => {
    switch (type) {
      case "tech":
        return TEMPLATES.tech({
          title: trimmedTitle,
          kind: techKind,
          layer: selectedLayers,
          use_when: one(useWhen),
          avoid_when: one(avoidWhen),
          version,
          language,
        });
      case "practice":
        return TEMPLATES.practice({
          title: trimmedTitle,
          applies_to: appliesTo,
          since,
          until,
        });
      case "check":
        return TEMPLATES.check({
          title: trimmedTitle,
          kind: checkKind,
          applies_to: appliesTo,
          command,
          since,
          until,
        });
      case "profile":
        return TEMPLATES.profile({
          title: trimmedTitle,
          description,
          use_when: one(useWhen),
          stack,
        });
      case "project":
        return TEMPLATES.project({
          title: trimmedTitle,
          description,
          path: projectPath,
          status,
          profile,
          stack,
        });
      default:
        return TEMPLATES.layer({ title: trimmedTitle, description });
    }
  };

  const buildBody = () => {
    const heading = `# ${trimmedTitle}\n`;
    const ruleText = type === "practice" ? rule.trim() : "";
    return ruleText ? `${heading}\n${ruleText}\n` : heading;
  };

  const submit = () => {
    if (!canCreate) return;
    setError("");
    create.mutate({ id: slug, data: buildData(), body: buildBody() });
  };

  const hasMore = type !== "layer";

  return (
    <CenterMorphModal open={open} onOpenChange={setOpen}>
      <CenterMorphModalContent
        ariaLabel={t("new.title")}
        ariaDescribedBy={descriptionId}
        closeButtonLabel={t("new.close")}
        className="flex max-h-[calc(100dvh-6rem)] max-w-[34rem] flex-col bg-card"
      >
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-6 pb-4">
            <div className="flex flex-col gap-0.5 pr-10">
              <h2 className="text-base font-semibold tracking-tight">{t("new.title")}</h2>
              <p id={descriptionId} className="text-[11px] text-muted-foreground">
                {t("new.description")}
              </p>
            </div>

            <Input
              ref={titleRef}
              label={t("field.title")}
              value={title}
              placeholder={t("new.titlePlaceholder")}
              onChange={(next) => {
                setTitle(next);
                if (!idEdited) setId(slugify(next));
                setError("");
              }}
              classNames={{
                label: "px-0 text-xs font-normal text-muted-foreground",
                field: "h-9 rounded-xl",
                input: "text-[13px]",
              }}
            />

            <Input
              label={t("new.id")}
              value={id}
              placeholder={t("new.idPlaceholder")}
              error={error || undefined}
              onChange={(next) => {
                setIdEdited(true);
                setId(slugify(next));
                setError("");
              }}
              classNames={{
                label: "px-0 text-xs font-normal text-muted-foreground",
                field: "h-9 rounded-xl",
                input: "font-mono text-[13px]",
              }}
            />

            <div className="flex flex-col gap-1.5">
              <span id={typeLabelId} className="text-xs text-muted-foreground">
                {t("new.type")}
              </span>
              <Tabs value={type} onValueChange={(value) => setType(value as NoteType)} variant="pill">
                <TabsList aria-labelledby={typeLabelId} className="flex-wrap bg-background">
                  {TYPE_ORDER.map((item) => (
                    <TabsTrigger key={item} value={item} className="gap-1.5 px-2.5 py-1 text-[12px]">
                      <span
                        aria-hidden="true"
                        className="size-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: `var(--type-${item})` }}
                      />
                      {typeLabel(item)}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>

            {type === "tech" && (
              <>
                <PillGroup labelId={techKindLabelId} label={t("field.kind")} value={techKind} options={TECH_KINDS} onChange={setTechKind} />

                <div className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span id={layersLabelId} className="text-xs text-muted-foreground">
                      {t("new.layers")}
                    </span>
                    <span className="text-[10.5px] text-muted-foreground">{t("new.layersHint")}</span>
                  </div>
                  <fieldset aria-labelledby={layersLabelId} className="m-0 flex min-w-0 flex-wrap gap-1 border-0 p-0">
                    {(layers.data ?? []).map((item) => {
                      const selected = selectedLayers.includes(item.id);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => toggleLayer(item.id)}
                          className={cn(
                            "h-7 rounded-full border px-2.5 text-[12px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                            selected
                              ? "border-primary/30 bg-primary/10 text-primary-text"
                              : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                          )}
                        >
                          {item.title || item.id}
                        </button>
                      );
                    })}
                  </fieldset>
                </div>

                <DialogInput
                  id="new-use-when"
                  label={t("new.useWhen")}
                  value={useWhen}
                  placeholder={t("new.useWhenPlaceholder")}
                  onChange={setUseWhen}
                />
              </>
            )}

            {type === "practice" && (
              <>
                <DialogLinkField
                  id="new-applies-to"
                  label={t("field.applies_to")}
                  field={APPLIES_TO_FIELD}
                  value={appliesTo}
                  onChange={(next) =>
                    setAppliesTo(Array.isArray(next) ? next.filter((item): item is string => typeof item === "string") : [])
                  }
                />
                <DialogInput id="new-rule" label={t("new.rule")} value={rule} placeholder={t("new.rulePlaceholder")} onChange={setRule} />
              </>
            )}

            {type === "check" && (
              <>
                <PillGroup
                  labelId={checkKindLabelId}
                  label={t("field.kind")}
                  value={checkKind}
                  options={CHECK_KINDS}
                  onChange={setCheckKind}
                />
                <DialogLinkField
                  id="new-check-applies-to"
                  label={t("field.applies_to")}
                  field={APPLIES_TO_FIELD}
                  value={appliesTo}
                  onChange={(next) =>
                    setAppliesTo(Array.isArray(next) ? next.filter((item): item is string => typeof item === "string") : [])
                  }
                />
                <DialogInput
                  id="new-command"
                  label={t("field.command")}
                  value={command}
                  placeholder={t("new.commandPlaceholder")}
                  mono
                  onChange={setCommand}
                />
              </>
            )}

            {type === "profile" && (
              <>
                <DialogTextarea
                  id="new-description"
                  label={t("field.description")}
                  value={description}
                  placeholder={t("new.descriptionPlaceholder")}
                  onChange={setDescription}
                />
                <DialogInput
                  id="new-profile-use-when"
                  label={t("new.useWhen")}
                  value={useWhen}
                  placeholder={t("new.useWhenPlaceholder")}
                  onChange={setUseWhen}
                />
              </>
            )}

            {type === "project" && (
              <>
                <DialogTextarea
                  id="new-project-description"
                  label={t("field.description")}
                  value={description}
                  placeholder={t("new.descriptionPlaceholder")}
                  onChange={setDescription}
                />
                <DialogInput
                  id="new-project-path"
                  label={t("field.path")}
                  value={projectPath}
                  placeholder={t("new.pathPlaceholder")}
                  mono
                  onChange={setProjectPath}
                />
                <PillGroup
                  labelId={statusLabelId}
                  label={t("field.status")}
                  value={status}
                  options={PROJECT_STATUSES}
                  onChange={setStatus}
                />
              </>
            )}

            {type === "layer" && (
              <DialogTextarea
                id="new-layer-description"
                label={t("field.description")}
                value={description}
                placeholder={t("new.descriptionPlaceholder")}
                onChange={setDescription}
              />
            )}

            {hasMore ? (
              <Collapsible open={moreOpen} onOpenChange={updateMore}>
                <CollapsibleTrigger className="min-h-6 w-full justify-start gap-1.5 rounded-lg px-1 py-0.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase hover:bg-muted/40">
                  <ChevronDown aria-hidden="true" className={cn("size-3.5 transition-transform duration-200", !moreOpen && "-rotate-90")} />
                  {t("new.more")}
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="flex flex-col gap-4 pt-3">
                    {type === "tech" && (
                      <>
                        <DialogInput
                          id="new-avoid-when"
                          label={t("new.avoidWhen")}
                          value={avoidWhen}
                          placeholder={t("new.useWhenPlaceholder")}
                          onChange={setAvoidWhen}
                        />
                        <DialogInput
                          id="new-version"
                          label={t("field.version")}
                          value={version}
                          placeholder={t("new.versionPlaceholder")}
                          mono
                          onChange={setVersion}
                        />
                        <DialogLinkField
                          id="new-language"
                          label={t("field.language")}
                          field={LANGUAGE_FIELD}
                          value={language}
                          filter={(note) => note.kind === "language"}
                          createOptions={{ kind: "language" }}
                          onChange={(next) => setLanguage(typeof next === "string" ? next : "")}
                        />
                      </>
                    )}

                    {type === "practice" && (
                      <>
                        <DialogInput id="new-practice-since" label={t("field.since")} value={since} onChange={setSince} />
                        <DialogInput id="new-practice-until" label={t("field.until")} value={until} onChange={setUntil} />
                      </>
                    )}

                    {type === "check" && (
                      <>
                        <DialogInput id="new-check-since" label={t("field.since")} value={since} onChange={setSince} />
                        <DialogInput id="new-check-until" label={t("field.until")} value={until} onChange={setUntil} />
                      </>
                    )}

                    {type === "profile" && (
                      <DialogField label={t("field.stack")}>
                        <StackField value={stack} onChange={(next) => setStack((next as Record<string, string[]>) ?? {})} />
                      </DialogField>
                    )}

                    {type === "project" && (
                      <>
                        <DialogLinkField
                          id="new-project-profile"
                          label={t("field.profile")}
                          field={PROFILE_FIELD}
                          value={profile}
                          onChange={(next) => setProfile(typeof next === "string" ? next : "")}
                        />
                        <DialogField label={t("field.stack")}>
                          <StackField value={stack} onChange={(next) => setStack((next as Record<string, string[]>) ?? {})} />
                        </DialogField>
                      </>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ) : null}
          </div>

          <div className="flex shrink-0 justify-end gap-2 border-t border-border/70 bg-card p-4">
            <Button type="button" variant="ghost" size="sm" pressScale={0.97} onClick={() => setOpen(false)}>
              {t("new.cancel")}
            </Button>
            <Button type="submit" size="sm" pressScale={0.97} disabled={!canCreate || create.isPending}>
              {t("new.create")}
            </Button>
          </div>
        </form>
      </CenterMorphModalContent>
    </CenterMorphModal>
  );
}
