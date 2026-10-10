import { cn } from "@/src/lib/utils";

export type ResultDatum = {
  id: number;
  label: string;
  votes: number;
  /** Optional sub-label shown under the bar, e.g. a slogan. */
  detail?: string;
};

type ResultsBarsProps = {
  data: ResultDatum[];
  /** Percentage of valid votes needed to win; shown as a threshold marker. */
  threshold?: number;
  className?: string;
};

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)",
];

function colorAt(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length];
}

/**
 * Horizontal vote-share bars. Values are printed explicitly next to every bar so
 * colour is never the only way to read a result, and tabular numerals keep the
 * digits aligned as counts stream in.
 */
export function ResultsBars({ data, threshold, className }: ResultsBarsProps) {
  const total = data.reduce((sum, entry) => sum + entry.votes, 0);
  const max = Math.max(1, ...data.map((entry) => entry.votes));

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {data.map((entry, index) => {
        const share = total > 0 ? (entry.votes / total) * 100 : 0;
        const width = (entry.votes / max) * 100;
        const isWinner = entry.votes === max && entry.votes > 0;

        return (
          <div key={entry.id} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-sm font-medium">{entry.label}</span>
              <span className="nums-tabular shrink-0 text-sm text-muted-foreground">
                {entry.votes.toLocaleString()} · {share.toFixed(1)}%
              </span>
            </div>
            <div
              className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted"
              role="img"
              aria-label={`${entry.label}: ${entry.votes} votes, ${share.toFixed(1)} percent`}
            >
              <div
                className="h-full rounded-full transition-[width] duration-500 ease-out"
                style={{ width: `${width}%`, backgroundColor: colorAt(index) }}
              />
              {threshold !== undefined && threshold > 0 && (
                <div
                  className="absolute inset-y-0 w-0.5 bg-foreground/40"
                  style={{ left: `${threshold}%` }}
                  aria-hidden="true"
                />
              )}
            </div>
            {entry.detail ? (
              <span className="text-xs text-muted-foreground">{entry.detail}</span>
            ) : null}
            {isWinner ? (
              <span className="w-fit rounded-full bg-success/15 px-2 py-0.5 text-[0.7rem] font-medium text-success">
                Leading
              </span>
            ) : null}
          </div>
        );
      })}
      <p className="nums-tabular text-xs text-muted-foreground">
        {total.toLocaleString()} valid vote{total === 1 ? "" : "s"} counted
      </p>
    </div>
  );
}