import type { NoteData, NoteType } from "@marcozvd/basics-core";
import { useT } from "@/i18n";
import { FIELDS } from "@/lib/fields";
import { FieldInput } from "./field-input";

const META_KEYS = new Set(["type", "source", "updated"]);

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
  const fields = FIELDS[type];
  const record = data as NoteData & Record<string, unknown>;
  const known = new Set(fields.map((field) => field.key));
  const extra = Object.keys(record).filter((key) => !known.has(key) && !META_KEYS.has(key));

  return (
    <div className="flex flex-col gap-3">
      {fields.map((field) => (
        <FieldInput
          key={field.key}
          id={`field-${field.key}`}
          field={field}
          value={record[field.key]}
          error={errors[field.key]}
          onChange={(value) => onChange({ ...record, [field.key]: value } as NoteData)}
        />
      ))}

      {extra.length > 0 && (
        <section className="rounded-md border border-dashed p-2">
          <h3 className="mb-1 text-xs font-medium text-muted-foreground">{t("field.other")}</h3>
          <dl className="flex flex-col gap-1">
            {extra.map((key) => (
              <div key={key} className="text-xs break-all">
                <dt className="inline font-mono text-muted-foreground">{key}: </dt>
                <dd className="inline font-mono">{JSON.stringify(record[key]) ?? "undefined"}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </div>
  );
}
