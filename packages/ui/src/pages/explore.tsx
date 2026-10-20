import type { NoteType } from "@marcozvd/basics-core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "cn";
import { Plus, Search } from "lucide-react";
import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Empty, ErrorState, Loading } from "@/components/state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type TranslationKey, useT } from "@/i18n";
import { ApiRequestError, createNote, type NoteFilter } from "@/lib/api";
import { TEMPLATES } from "@/lib/fields";
import { useLayers, useNotes, useSearch } from "@/lib/queries";

const TYPE_ORDER: NoteType[] = ["tech", "practice", "check", "profile", "project", "layer"];
const ALL_TYPES: NoteType[] = ["layer", "tech", "practice", "check", "profile", "project"];

interface Row {
  id: string;
  type: NoteType;
  title: string;
  source: string;
  kind?: string;
}

const slugify = (value: string) => value.trim().toLowerCase().replace(/\s+/g, "-");

export function ExplorePage() {
  const t = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [type, setType] = useState<NoteType | undefined>();
  const [layer, setLayer] = useState<string | undefined>();
  const [searchText, setSearchText] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [newType, setNewType] = useState<NoteType>("tech");
  const [newId, setNewId] = useState("");
  const [newLayer, setNewLayer] = useState("backend");
  const [newError, setNewError] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(searchText.trim());
      setSelected(0);
    }, 200);
    return () => clearTimeout(timer);
  }, [searchText]);

  const filter: NoteFilter = { type, layer };
  const layers = useLayers();
  const notes = useNotes(filter);
  const allInLayer = useNotes(layer ? { layer } : {});
  const hits = useSearch(query, filter);
  const listQuery = query ? hits : notes;

  const counts = useMemo(() => {
    const map = new Map<NoteType, number>();
    for (const note of allInLayer.data ?? []) map.set(note.type, (map.get(note.type) ?? 0) + 1);
    return map;
  }, [allInLayer.data]);

  const rows: Row[] = useMemo(() => {
    if (!query) {
      return (notes.data ?? []).map((note) => ({
        id: note.id,
        type: note.type,
        title: note.title || note.id,
        source: note.source,
        kind: note.kind,
      }));
    }
    const summaries = new Map((notes.data ?? []).map((note) => [note.id, note]));
    return (hits.data ?? []).map((hit) => {
      const summary = summaries.get(hit.id);
      return {
        id: hit.id,
        type: hit.type,
        title: hit.title || hit.id,
        source: summary?.source ?? "",
        kind: summary?.kind,
      };
    });
  }, [query, notes.data, hits.data]);

  useEffect(() => {
    if (selected >= rows.length) setSelected(Math.max(0, rows.length - 1));
  }, [rows.length, selected]);

  useEffect(() => {
    document.getElementById(`note-row-${selected}`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const openNote = (id: string) => navigate(`/notes/${encodeURIComponent(id)}`);

  const selectType = (value: NoteType | undefined) => {
    setType(value);
    setSelected(0);
  };

  const selectLayer = (value: string | undefined) => {
    setLayer(value);
    setSelected(0);
  };

  const handleKeyDown = (event: ReactKeyboardEvent) => {
    if (!rows.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelected((index) => Math.min(index + 1, rows.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelected((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      const row = rows[selected];
      if (!row) return;
      event.preventDefault();
      openNote(row.id);
    }
  };

  const create = useMutation({
    mutationFn: (input: { id: string; type: NoteType; layer: string }) =>
      createNote({
        id: input.id,
        data: TEMPLATES[input.type]({ title: input.id, layer: input.layer || undefined }),
        body: `# ${input.id}\n`,
      }),
    onSuccess: (note) => {
      void queryClient.invalidateQueries({ queryKey: ["notes"] });
      setDialogOpen(false);
      navigate(`/notes/${encodeURIComponent(note.id)}`);
    },
    onError: (error) => {
      if (error instanceof ApiRequestError && error.body.error === "exists") {
        setNewError(t("new.exists"));
        return;
      }
      setNewError(error instanceof Error && error.message ? error.message : t("new.failed"));
      toast.error(t("new.failed"));
    },
  });

  const openDialog = () => {
    setNewType("tech");
    setNewId("");
    setNewLayer(layers.data?.[0]?.id ?? "backend");
    setNewError("");
    create.reset();
    setDialogOpen(true);
  };

  const submitNew = () => {
    const id = slugify(newId);
    if (!id) return;
    setNewError("");
    create.mutate({ id, type: newType, layer: newLayer });
  };

  const typeLabel = (value: NoteType) => t(`type.${value}` as TranslationKey);
  const optionLabel = (value: string) => t(`option.${value}` as TranslationKey);

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-[220px] shrink-0 flex-col gap-5 overflow-y-auto border-r px-2 py-3">
        <section>
          <h2 className="mb-1 px-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{t("explore.layers")}</h2>
          <button
            type="button"
            aria-pressed={layer === undefined}
            onClick={() => selectLayer(undefined)}
            className={cn(
              "flex h-7 w-full items-center rounded-md px-2 text-left text-[13px] transition-colors hover:bg-muted",
              layer === undefined ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground",
            )}
          >
            {t("explore.allLayers")}
          </button>
          {layers.data?.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={layer === item.id}
              onClick={() => selectLayer(item.id)}
              className={cn(
                "flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] transition-colors hover:bg-muted",
                layer === item.id ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground",
              )}
            >
              <span className="truncate">{item.title || item.id}</span>
              <span className="ml-auto font-mono text-[11px] tabular-nums">{item.techs.length}</span>
            </button>
          ))}
        </section>

        <section>
          <h2 className="mb-1 px-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{t("explore.types")}</h2>
          <button
            type="button"
            aria-pressed={type === undefined}
            onClick={() => selectType(undefined)}
            className={cn(
              "flex h-7 w-full items-center rounded-md px-2 text-left text-[13px] transition-colors hover:bg-muted",
              type === undefined ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground",
            )}
          >
            {t("type.all")}
            <span className="ml-auto font-mono text-[11px] tabular-nums">{allInLayer.data?.length ?? 0}</span>
          </button>
          {TYPE_ORDER.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={type === item}
              onClick={() => selectType(item)}
              className={cn(
                "flex h-7 w-full items-center rounded-md px-2 text-left text-[13px] transition-colors hover:bg-muted",
                type === item ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground",
              )}
            >
              {typeLabel(item)}
              <span className="ml-auto font-mono text-[11px] tabular-nums">{counts.get(item) ?? 0}</span>
            </button>
          ))}
        </section>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b p-3">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t("explore.searchPlaceholder")}
              aria-label={t("explore.searchPlaceholder")}
              className="pl-8"
            />
          </div>
          <Button onClick={openDialog}>
            <Plus aria-hidden="true" />
            {t("explore.newNote")}
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {listQuery.isPending ? (
            <Loading />
          ) : listQuery.error ? (
            <ErrorState error={listQuery.error} />
          ) : rows.length === 0 ? (
            <Empty title={t("explore.empty.title")} description={t("explore.empty.description")} />
          ) : (
            <div
              role="listbox"
              tabIndex={0}
              aria-label={t("explore.types")}
              onKeyDown={handleKeyDown}
              className="flex flex-col gap-0.5 outline-none"
            >
              {rows.map((row, index) => (
                <button
                  key={row.id}
                  id={`note-row-${index}`}
                  type="button"
                  role="option"
                  aria-selected={index === selected}
                  data-note-row
                  onMouseEnter={() => setSelected(index)}
                  onClick={() => openNote(row.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted",
                    index === selected && "bg-muted",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{row.title}</span>
                    <span className="block truncate font-mono text-[11px] text-muted-foreground">{row.id}</span>
                  </span>
                  {row.source.startsWith("agent:") && (
                    <Badge variant="secondary" className="rounded px-1.5 font-mono text-[10px]">
                      {t("explore.agentBadge")}
                    </Badge>
                  )}
                  {row.kind && <span className="text-[11px] text-muted-foreground">{optionLabel(row.kind)}</span>}
                  <Badge variant="outline">{typeLabel(row.type)}</Badge>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("new.title")}</DialogTitle>
            <DialogDescription>{t("new.slug", { id: slugify(newId) || t("new.idPlaceholder") })}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-type" className="text-xs text-muted-foreground">
                {t("new.type")}
              </Label>
              <Select value={newType} onValueChange={(value) => setNewType(value as NoteType)}>
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
                value={newId}
                autoFocus
                placeholder={t("new.idPlaceholder")}
                aria-invalid={Boolean(newError)}
                onChange={(event) => setNewId(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    submitNew();
                  }
                }}
              />
            </div>

            {newType === "tech" && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-layer" className="text-xs text-muted-foreground">
                  {t("new.layer")}
                </Label>
                <Select value={newLayer} onValueChange={setNewLayer}>
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

            {newError && (
              <p className="text-xs text-destructive" role="alert">
                {newError}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t("new.cancel")}
            </Button>
            <Button onClick={submitNew} disabled={!slugify(newId) || create.isPending}>
              {t("new.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
