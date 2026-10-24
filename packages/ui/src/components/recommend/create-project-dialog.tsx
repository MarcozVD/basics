"use client";

import type { NoteData, NoteDetail } from "@marcozvd/basics-core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type ComponentProps, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/motion/button/base";
import { CenterMorphModal, CenterMorphModalContent } from "@/components/motion/center-morph-modal";
import { Input } from "@/components/motion/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
import { LinkField, StackField } from "@/components/note-form/field-input";
import { type TranslationKey, useT } from "@/i18n";
import { ApiRequestError, createNote, getNote, saveNote } from "@/lib/api";
import { type Field, TEMPLATES } from "@/lib/fields";
import { slugify } from "@/lib/slug";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const PROJECT_STATUSES = ["active", "paused", "archived"] as const;
type ProjectStatus = (typeof PROJECT_STATUSES)[number];
const PROFILE_FIELD: Field = { key: "profile", kind: "link", linkType: "profile" };

export interface CreateProjectPrefill {
  /** The Recommend description, so the project starts with the user's brief. */
  description: string;
  /** Profile id when the recommendation came from a profile. */
  profile?: string;
  /** Selected techs grouped by layer, so the stack starts filled in and editable. */
  stack: Record<string, string[]>;
  /** The recommendation's explanation text when available. */
  reason?: string;
}

function DialogField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="px-0 text-xs font-normal text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function FieldInput({
  id,
  label,
  value,
  placeholder,
  mono = false,
  error,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  mono?: boolean;
  error?: string;
  onChange: (value: string) => void;
}) {
  return (
    <Input
      id={id}
      label={label}
      value={value}
      placeholder={placeholder}
      error={error}
      onChange={onChange}
      classNames={{
        label: "px-0 text-xs font-normal text-muted-foreground",
        field: "h-9 rounded-xl",
        input: cn("text-[13px]", mono && "font-mono"),
      }}
    />
  );
}

function FieldTextarea({
  id,
  label,
  value,
  placeholder,
  rows = 2,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  rows?: number;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="px-0 text-xs font-normal text-muted-foreground">
        {label}
      </label>
      <textarea
        id={id}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full resize-y rounded-xl border border-border bg-background px-2.5 py-2 text-[13px] leading-5 text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-foreground/40 focus:ring-2 focus:ring-ring/40"
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

/** Merge per-layer stacks without duplicates; existing layers are preserved. */
function mergeStacks(base: Record<string, string[]>, next: Record<string, string[]>): Record<string, string[]> {
  const merged = { ...base };
  for (const [layer, ids] of Object.entries(next)) {
    if (ids.length === 0) continue;
    merged[layer] = [...new Set([...(merged[layer] ?? []), ...ids])];
  }
  return merged;
}

/**
 * Compact "Create project" dialog for the Recommend page. Reuses the editor's
 * LinkField/StackField (their panels portal to body, so they stay usable inside
 * the modal) and the TEMPLATES builders (a project only gets non-empty fields).
 * When the id already belongs to a project, it offers to merge the selected
 * stack instead of failing with the generic "exists" error.
 */
export function CreateProjectDialog({
  open,
  onOpenChange,
  prefill,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefill: CreateProjectPrefill;
}) {
  const t = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const statusLabelId = useId();
  const descriptionId = useId();
  const titleRef = useRef<HTMLInputElement>(null);
  const lastOpen = useRef<boolean | null>(null);

  const [title, setTitle] = useState("");
  const [id, setId] = useState("");
  const [idEdited, setIdEdited] = useState(false);
  const [description, setDescription] = useState("");
  const [path, setPath] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("active");
  const [profile, setProfile] = useState("");
  const [stack, setStack] = useState<Record<string, string[]>>({});
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  /** Existing note when the create failed because a project with this id exists. */
  const [existing, setExisting] = useState<NoteDetail | null>(null);

  useEffect(() => {
    if (lastOpen.current === open) return;
    lastOpen.current = open;
    if (!open) return;
    setTitle("");
    setId("");
    setIdEdited(false);
    setDescription(prefill.description);
    setPath("");
    setStatus("active");
    setProfile(prefill.profile ?? "");
    setStack(prefill.stack);
    setReason(prefill.reason ?? "");
    setError("");
    setExisting(null);
    const frame = requestAnimationFrame(() => titleRef.current?.focus());
    return () => cancelAnimationFrame(frame);
    // The prefill is snapshotted when the dialog opens, so later prefill changes are ignored.
  }, [open, prefill.description, prefill.profile, prefill.stack, prefill.reason]);

  const create = useMutation({
    mutationFn: (input: { id: string; data: NoteData; body: string }) => createNote(input),
    onSuccess: (note) => {
      void queryClient.invalidateQueries({ queryKey: ["notes"] });
      onOpenChange(false);
      navigate(`/projects?p=${encodeURIComponent(note.id)}`);
    },
    onError: (mutationError) => {
      if (mutationError instanceof ApiRequestError && mutationError.body.error === "exists") {
        void getNote(slug)
          .then((detail) => {
            if (detail.type === "project") setExisting(detail);
            else setError(t("new.exists"));
          })
          .catch(() => setError(t("new.exists")));
        return;
      }
      setError(t("new.failed"));
      toast.error(t("new.failed"));
    },
  });

  const update = useMutation({
    mutationFn: (input: { id: string; data: NoteData; body: string; hash: string }) =>
      saveNote(input.id, { data: input.data, body: input.body, expectedHash: input.hash }),
    onSuccess: (note) => {
      void queryClient.invalidateQueries({ queryKey: ["notes"] });
      toast.success(t("recommend.projectUpdated"));
      onOpenChange(false);
      navigate(`/projects?p=${encodeURIComponent(note.id)}`);
    },
    onError: () => toast.error(t("recommend.projectUpdateFailed")),
  });

  const trimmedTitle = title.trim();
  const slug = id.length ? id : slugify(title);
  const canCreate = Boolean(trimmedTitle && slug);
  const busy = create.isPending || update.isPending;

  const submit = () => {
    if (!canCreate || busy) return;
    setError("");
    if (existing) {
      const existingProject = existing.data as Extract<NoteData, { type: "project" }>;
      const mergedData: NoteData = {
        ...existingProject,
        stack: mergeStacks(existingProject.stack, stack),
      };
      update.mutate({ id: existing.id, data: mergedData, body: existing.body, hash: existing.hash });
      return;
    }
    create.mutate({
      id: slug,
      data: TEMPLATES.project({ title: trimmedTitle, description, path, status, profile, stack, reason }),
      body: `# ${trimmedTitle}\n`,
    });
  };

  return (
    <CenterMorphModal open={open} onOpenChange={onOpenChange}>
      <CenterMorphModalContent
        ariaLabel={t("recommend.projectTitle")}
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
              <h2 className="text-base font-semibold tracking-tight">{t("recommend.projectTitle")}</h2>
              <p id={descriptionId} className="text-[11px] text-muted-foreground">
                {t("recommend.projectDescription")}
              </p>
            </div>

            <FieldInput
              id="create-project-title"
              label={t("field.title")}
              value={title}
              placeholder={t("new.titlePlaceholder")}
              onChange={(next) => {
                setTitle(next);
                if (!idEdited) setId(slugify(next));
                setError("");
                setExisting(null);
              }}
            />

            <FieldInput
              id="create-project-id"
              label={t("new.id")}
              value={id}
              placeholder={t("new.idPlaceholder")}
              mono
              error={existing ? t("recommend.projectExists") : error || undefined}
              onChange={(next) => {
                setIdEdited(true);
                setId(slugify(next));
                setError("");
                setExisting(null);
              }}
            />

            <FieldTextarea
              id="create-project-description"
              label={t("field.description")}
              value={description}
              placeholder={t("new.descriptionPlaceholder")}
              onChange={setDescription}
            />

            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <FieldInput
                id="create-project-path"
                label={t("field.path")}
                value={path}
                placeholder={t("new.pathPlaceholder")}
                mono
                onChange={setPath}
              />
              <PillGroup labelId={statusLabelId} label={t("field.status")} value={status} options={PROJECT_STATUSES} onChange={setStatus} />
            </div>

            <DialogLinkField
              id="create-project-profile"
              label={t("field.profile")}
              field={PROFILE_FIELD}
              value={profile}
              onChange={(next) => setProfile(typeof next === "string" ? next : "")}
            />

            <DialogField label={t("field.stack")}>
              <StackField value={stack} onChange={(next) => setStack((next as Record<string, string[]>) ?? {})} />
            </DialogField>

            <FieldTextarea
              id="create-project-reason"
              label={t("field.reason")}
              value={reason}
              placeholder={t("recommend.reasonPlaceholder")}
              rows={1}
              onChange={setReason}
            />
          </div>

          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border/70 bg-card p-4">
            <span className="min-w-0 flex-1 text-[11px] text-destructive">{error}</span>
            <div className="flex shrink-0 items-center gap-2">
              <Button type="button" variant="ghost" size="sm" pressScale={0.97} onClick={() => onOpenChange(false)}>
                {t("new.cancel")}
              </Button>
              <Button type="submit" size="sm" pressScale={0.97} disabled={!canCreate || busy}>
                {existing ? t("recommend.updateStack") : t("new.create")}
              </Button>
            </div>
          </div>
        </form>
      </CenterMorphModalContent>
    </CenterMorphModal>
  );
}
