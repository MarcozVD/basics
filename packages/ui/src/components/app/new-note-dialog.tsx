"use client";

import type { NoteType } from "@marcozvd/basics-core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/motion/button/base";
import { CenterMorphModal, CenterMorphModalContent } from "@/components/motion/center-morph-modal";
import { Input } from "@/components/motion/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
import { type TranslationKey, useT } from "@/i18n";
import { ApiRequestError, createNote } from "@/lib/api";
import { TEMPLATES } from "@/lib/fields";
import { useLayers } from "@/lib/queries";
import { useReturnFocus } from "@/lib/return-focus";
import { slugify } from "@/lib/slug";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const TYPE_ORDER: NoteType[] = ["tech", "practice", "check", "profile", "project", "layer"];
const TECH_KINDS = ["language", "framework", "library", "tool", "service", "database"] as const;
type TechKind = (typeof TECH_KINDS)[number];

interface NewNoteDetail {
  id?: string;
  type?: NoteType;
}

interface CreateInput {
  id: string;
  title: string;
  type: NoteType;
  kind: TechKind;
  layers: string[];
  useWhen: string;
}

/**
 * Mounted once in the layout; opens on the `basics:new-note` event (dock palette, Explore).
 * Type and layer are pill segments rather than dropdowns: the morph modal clips its surface,
 * so an inline dropdown panel would be cut off at the modal's edge.
 */
export function NewNoteDialog() {
  const t = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const layers = useLayers();
  const typeLabelId = useId();
  const kindLabelId = useId();
  const layersLabelId = useId();
  const descriptionId = useId();
  const titleRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [type, setType] = useState<NoteType>("tech");
  const [title, setTitle] = useState("");
  const [id, setId] = useState("");
  const [idEdited, setIdEdited] = useState(false);
  const [kind, setKind] = useState<TechKind>("framework");
  const [selectedLayers, setSelectedLayers] = useState<string[]>([]);
  const [useWhen, setUseWhen] = useState("");
  const [error, setError] = useState("");
  useReturnFocus(open);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => titleRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const create = useMutation({
    mutationFn: (input: CreateInput) => {
      const data = TEMPLATES[input.type]({
        title: input.title,
        layer: input.layers.length > 0 ? input.layers : undefined,
      });
      if (data.type === "tech") {
        data.kind = input.kind;
        if (input.useWhen) data.use_when = [input.useWhen];
      }
      if (data.type === "profile" && input.useWhen) data.use_when = [input.useWhen];
      return createNote({ id: input.id, data, body: `# ${input.title}\n` });
    },
    onSuccess: (note) => {
      void queryClient.invalidateQueries({ queryKey: ["notes"] });
      setOpen(false);
      navigate(`/notes/${encodeURIComponent(note.id)}`);
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
      setKind("framework");
      setSelectedLayers(layers.data?.[0]?.id ? [layers.data[0].id] : []);
      setUseWhen("");
      setError("");
      setOpen(true);
    };
    window.addEventListener("basics:new-note", onOpen);
    return () => window.removeEventListener("basics:new-note", onOpen);
  }, [layers.data]);

  const slug = slugify(id);
  const submit = () => {
    if (!slug || !title.trim() || (type === "tech" && selectedLayers.length === 0)) return;
    setError("");
    create.mutate({ id: slug, title, type, kind, layers: selectedLayers, useWhen: useWhen.trim() });
  };

  const typeLabel = (value: NoteType) => t(`type.${value}` as TranslationKey);
  const optionLabel = (value: TechKind) => t(`option.${value}` as TranslationKey);
  const toggleLayer = (value: string) => {
    setSelectedLayers((current) => (current.includes(value) ? current.filter((item) => item !== value) : [...current, value]));
  };

  return (
    <CenterMorphModal open={open} onOpenChange={setOpen}>
      <CenterMorphModalContent
        ariaLabel={t("new.title")}
        ariaDescribedBy={descriptionId}
        closeButtonLabel={t("new.close")}
        className="max-w-[34rem] bg-card"
      >
        <form
          className="flex max-h-[calc(100dvh-2rem)] flex-col gap-4 overflow-y-auto p-6"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
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
              <div className="flex flex-col gap-1.5">
                <span id={kindLabelId} className="text-xs text-muted-foreground">
                  {t("field.kind")}
                </span>
                <Tabs value={kind} onValueChange={(value) => setKind(value as TechKind)} variant="pill">
                  <TabsList aria-labelledby={kindLabelId} className="flex-wrap bg-background">
                    {TECH_KINDS.map((item) => (
                      <TabsTrigger key={item} value={item} className="px-2.5 py-1 text-[12px]">
                        {optionLabel(item)}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </div>

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
            </>
          )}

          {type === "tech" || type === "profile" ? (
            <Input
              label={t("new.useWhen")}
              value={useWhen}
              placeholder={t("new.useWhenPlaceholder")}
              onChange={setUseWhen}
              classNames={{
                label: "px-0 text-xs font-normal text-muted-foreground",
                field: "h-9 rounded-xl",
                input: "text-[13px]",
              }}
            />
          ) : null}

          <div className="mt-1 flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" pressScale={0.97} onClick={() => setOpen(false)}>
              {t("new.cancel")}
            </Button>
            <Button
              type="submit"
              size="sm"
              pressScale={0.97}
              disabled={!title.trim() || !slug || (type === "tech" && selectedLayers.length === 0) || create.isPending}
            >
              {t("new.create")}
            </Button>
          </div>
        </form>
      </CenterMorphModalContent>
    </CenterMorphModal>
  );
}
