import type { CompareReport } from "@marcozvd/basics-core";
import { useI18n } from "@/i18n";
import { compareCopy } from "@/lib/compare-copy";
import { compareSummary } from "@/lib/compare-summary";

export function CompareSummary({ report }: { report: CompareReport }) {
  const { language } = useI18n();
  const c = compareCopy[language];
  const number = (value: number) => new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format(value);
  const conditions = ["without_basics", "with_basics"] as const;
  const summaries = conditions.map((condition) => compareSummary(report, condition));
  const labels = [c.stack, c.checksPassed, c.wall, c.tokens];
  return (
    <div className="min-w-0 rounded-xl border border-border p-3" data-testid="compare-summary">
      <table className="w-full table-fixed text-left text-xs">
        <caption className="pb-3 text-left text-sm font-semibold">{c.summary}</caption>
        <thead>
          <tr>
            <td className="w-[34%]" />
            {conditions.map((condition) => (
              <th key={condition} scope="col" className="pb-2 pl-2 font-medium">
                {c[condition]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {labels.map((label, index) => (
            <tr key={label} className="border-t border-border">
              <th scope="row" className="py-2 pr-2 align-top font-normal text-muted-foreground">
                {label}
              </th>
              {summaries.map((summary, column) => {
                const value = [summary.layers, summary.checks, summary.wall, summary.tokens][index];
                const text = !value
                  ? c.unavailable
                  : index === 0
                    ? c.layersCount.replace("{matched}", number(value.mean)).replace("{total}", number(summary.layerTotal?.mean ?? 0))
                    : index === 1
                      ? c.checksCount.replace("{passed}", number(value.mean)).replace("{total}", number(summary.approved?.mean ?? 0))
                      : `${number(value.mean)}${index === 2 ? " s" : ""}`;
                return (
                  <td key={conditions[column]} className="py-2 pl-2 align-top tabular-nums">
                    <span>
                      {report.runs > 1 && value ? `${c.mean}: ` : ""}
                      {text}
                    </span>
                    {report.runs > 1 && value ? (
                      <span className="mt-1 block text-muted-foreground">
                        {c.spreadShort}: {number(value.stddev)}
                        {index === 2 ? " s" : ""}
                      </span>
                    ) : null}
                    {index === 1 && (summary.untrusted?.mean ?? 0) > 0 ? (
                      <span className="mt-1 block text-muted-foreground">
                        {number(summary.untrusted!.mean)} {c.notApproved}
                      </span>
                    ) : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
