"use client";

import type { NoteType } from "@marcozvd/basics-core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type TranslationKey, useT } from "@/i18n";
import { ApiRequestError, createNote } from "@/lib/api";
import { TEMPLATES } from "@/lib/fields";
import { useLayers } from "@/lib/queries";
import { toast } from "@/lib/toast";

const ALL_TYPES: NoteType[] = ["layer", "tech", "practice", "check", "profile", "project"];

const slugify = (value: string) => value.trim().toLowerCase().replace(/\s+/g, "-");

/** Mounted once in the layout; opens on the `basics:new-note` event (dock palette, Explore). */
export function NewNoteDialog() {
  const t = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const layers = useLayers();

  const [open, setOpen] = useState(false);
  const [type, setType] = useState<NoteType>("tech");
  const [id, setId] = useState("");
  const [layer, setLayer] = useState("backend");
  const [error, setError] = useState("");

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

  const submit = () => {
    const slug = slugify(id);
    if (!slug) return;
    setError("");
    create.mutate({ id: slug, type, layer });
  };

  const typeLabel = (value: NoteType) => t(`type.${value}` as TranslationKey);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("new.title")}</DialogTitle>
          <DialogDescription>{t("new.slug", { id: slugify(id) || t("new.idPlaceholder") })}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-type" className="text-xs text-muted-foreground">
              {t("new.type")}
            </Label>
            <Select value={type} onValueChange={(value) => setType(value as NoteType)}>
              <SelectTrigger id="new-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALL_TYPES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {typeLabel(item)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-id" className="text-xs text-muted-foreground">
              {t("new.id")}
            </Label>
            <Input
              id="new-id"
              value={id}
              autoFocus
              placeholder={t("new.idPlaceholder")}
              aria-invalid={Boolean(error)}
              onChange={(event) => setId(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submit();
                }
              }}
            />
          </div>

          {type === "tech" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-layer" className="text-xs text-muted-foreground">
                {t("new.layer")}
              </Label>
              <Select value={layer} onValueChange={setLayer}>
                <SelectTrigger id="new-layer" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(layers.data ?? []).map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.title || item.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {error && (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("new.cancel")}
          </Button>
          <Button onClick={submit} disabled={!slugify(id) || create.isPending}>
            {t("new.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
