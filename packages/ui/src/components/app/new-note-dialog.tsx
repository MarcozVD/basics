"use client";

import type { NoteType } from "@marcozvd/basics-core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
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
import { toast } from "@/lib/toast";

const TYPE_ORDER: NoteType[] = ["tech", "practice", "check", "profile", "project", "layer"];

const slugify = (value: string) => value.trim().toLowerCase().replace(/\s+/g, "-");

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
  const layerLabelId = useId();
  const descriptionId = useId();

  const [open, setOpen] = useState(false);
  const [type, setType] = useState<NoteType>("tech");
  const [id, setId] = useState("");
  const [layer, setLayer] = useState("backend");
  const [error, setError] = useState("");
  useReturnFocus(open);

  const create = useMutation({
    mutationFn: (input: { id: string; type: NoteType; layer: string }) =>
      createNote({
        id: input.id,
        data: TEMPLATES[input.type]({ title: input.id, layer: input.layer || undefined }),
        body: `# ${input.id}\n`,
      }),
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
      const requested = (event as CustomEvent<{ id?: string }>).detail?.id ?? "";
      setType("tech");
      setId(requested);
      setLayer(layers.data?.[0]?.id ?? "backend");
      setError("");
      setOpen(true);
    };
    window.addEventListener("basics:new-note", onOpen);
    return () => window.removeEventListener("basics:new-note", onOpen);
  }, [layers.data]);

  const slug = slugify(id);
  const submit = () => {
    if (!slug) return;
    setError("");
    create.mutate({ id: slug, type, layer });
  };

  const typeLabel = (value: NoteType) => t(`type.${value}` as TranslationKey);

  return (
    <CenterMorphModal open={open} onOpenChange={setOpen}>
      <CenterMorphModalContent
        ariaLabel={t("new.title")}
        ariaDescribedBy={descriptionId}
        closeButtonLabel={t("new.close")}
        className="max-w-[34rem] bg-card"
      >
        <form
          className="flex flex-col gap-4 p-6"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="flex flex-col gap-0.5 pr-10">
            <h2 className="text-base font-semibold tracking-tight">{t("new.title")}</h2>
            <p id={descriptionId} className="truncate font-mono text-[11px] text-muted-foreground">
              {t("new.slug", { id: slug || t("new.idPlaceholder") })}
            </p>
          </div>

          <Input
            label={t("new.id")}
            value={id}
            placeholder={t("new.idPlaceholder")}
            error={error || undefined}
            onChange={setId}
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
              <TabsList aria-labelledby={typeLabelId} className="bg-background">
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
            <div className="flex flex-col gap-1.5">
              <span id={layerLabelId} className="text-xs text-muted-foreground">
                {t("new.layer")}
              </span>
              <Tabs value={layer} onValueChange={setLayer} variant="pill">
                <TabsList aria-labelledby={layerLabelId} className="bg-background">
                  {(layers.data ?? []).map((item) => (
                    <TabsTrigger key={item.id} value={item.id} className="px-2.5 py-1 text-[12px]">
                      {item.title || item.id}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
          )}

          <div className="mt-1 flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" pressScale={0.97} onClick={() => setOpen(false)}>
              {t("new.cancel")}
            </Button>
            <Button type="submit" size="sm" pressScale={0.97} disabled={!slug || create.isPending}>
              {t("new.create")}
            </Button>
          </div>
        </form>
      </CenterMorphModalContent>
    </CenterMorphModal>
  );
}
