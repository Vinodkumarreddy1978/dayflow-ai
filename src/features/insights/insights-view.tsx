"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Award,
  Eye,
  Lightbulb,
  Repeat,
  Sparkles,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardHeader, EmptyState, Skeleton } from "@/components/ui/card";
import { useSettings, useTimeZone } from "@/features/settings/use-settings";
import { addDays, todayInTimeZone } from "@/lib/domain/timezone";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  useGenerateReport,
  useReports,
  type PeriodType,
  type StoredReport,
} from "./use-reports";
import type { InsightKind } from "@/lib/ai/facts";

const PERIODS: { key: PeriodType; label: string }[] = [
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
];

const KIND_META: Record<
  InsightKind,
  { icon: typeof Eye; label: string; className: string }
> = {
  observation: { icon: Eye, label: "Observation", className: "text-text-muted" },
  habit: { icon: Repeat, label: "Pattern", className: "text-accent" },
  warning: { icon: AlertTriangle, label: "Worth noticing", className: "text-warning" },
  recommendation: { icon: Lightbulb, label: "Suggestion", className: "text-accent" },
  achievement: { icon: Award, label: "Well done", className: "text-success" },
};

export function InsightsView() {
  const timeZone = useTimeZone();
  const { data: settings } = useSettings();
  const [periodType, setPeriodType] = useState<PeriodType>("weekly");

  const { data: reports, isLoading } = useReports(periodType);
  const generate = useGenerateReport();

  const today = todayInTimeZone(timeZone);
  const weekStartsOn = settings?.week_starts_on ?? 1;

  /** The most recent period that has actually finished. */
  const targetPeriodStart = useMemo(() => {
    if (periodType === "daily") return addDays(today, -1);

    if (periodType === "weekly") {
      const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
      const daysIntoWeek = (weekday - weekStartsOn + 7) % 7;
      // Start of this week, minus a week: the last complete one.
      return addDays(today, -daysIntoWeek - 7);
    }

    const [year, month] = today.split("-").map(Number);
    const previous = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 2, 1));
    return `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, "0")}-01`;
  }, [periodType, today, weekStartsOn]);

  const alreadyGenerated = (reports ?? []).some(
    (report) => report.periodStart === targetPeriodStart,
  );

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-text">Insights</h1>
        <p className="mt-1 text-sm text-text-muted">
          Every observation here is arithmetic on your own records. Nothing is guessed,
          and nothing is invented.
        </p>
      </header>

      {settings && !settings.ai_consent && (
        <Card className="border-accent/30 bg-accent/5 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-text">
                Reports are on, AI wording is off
              </p>
              <p className="mt-1 text-sm text-text-muted">
                You will still get the full report - findings, figures and suggestions,
                all computed locally. Turning on AI only changes who writes the prose.
              </p>
            </div>
            <Link href="/settings">
              <Button size="sm" variant="secondary">
                <Sparkles className="size-4" aria-hidden="true" />
                Review AI settings
              </Button>
            </Link>
          </div>
        </Card>
      )}

      <div
        role="tablist"
        aria-label="Report period"
        className="flex gap-1 rounded-lg border border-border bg-surface-raised p-1"
      >
        {PERIODS.map((period) => (
          <button
            key={period.key}
            role="tab"
            aria-selected={periodType === period.key}
            onClick={() => setPeriodType(period.key)}
            className={cn(
              "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              periodType === period.key
                ? "bg-accent text-on-accent"
                : "text-text-muted hover:bg-surface-sunken hover:text-text",
            )}
          >
            {period.label}
          </button>
        ))}
      </div>

      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-text">
            {alreadyGenerated
              ? "Latest report is ready"
              : "No report for the last period yet"}
          </p>
          <p className="mt-0.5 text-xs text-text-muted">
            Covering {formatDate(`${targetPeriodStart}T12:00:00Z`, "UTC", "medium")}
            {periodType !== "daily" && " onwards"}
          </p>
        </div>

        <Button
          isLoading={generate.isPending}
          onClick={() => generate.mutate({ periodType, periodStart: targetPeriodStart })}
        >
          <Wand2 className="size-4" aria-hidden="true" />
          {alreadyGenerated ? "Regenerate" : "Generate"}
        </Button>
      </Card>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (reports ?? []).length === 0 ? (
        <Card>
          <EmptyState
            title="No reports yet"
            description="Generate one above, or let DayFlow produce them on a schedule from Settings."
            icon={<Sparkles className="size-6" aria-hidden="true" />}
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {(reports ?? []).map((report) => (
            <ReportCard key={report.id} report={report} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReportCard({ report }: { report: StoredReport }) {
  const label =
    report.periodType === "daily"
      ? formatDate(`${report.periodStart}T12:00:00Z`, "UTC", "long")
      : `${formatDate(`${report.periodStart}T12:00:00Z`, "UTC", "medium")} – ${formatDate(`${report.periodEnd}T12:00:00Z`, "UTC", "medium")}`;

  return (
    <Card>
      <CardHeader
        title={label}
        action={
          // Provenance is stated on every report, not buried in settings. A
          // reader should never have to wonder whether a sentence came from a
          // model or from their own arithmetic.
          <Badge tone={report.generatedBy === "ai" ? "accent" : "neutral"}>
            {report.generatedBy === "ai" ? "AI wording" : "No AI"}
          </Badge>
        }
      />

      <div className="space-y-4 p-4 pt-0">
        <p className="text-sm leading-relaxed text-text">{report.content.summary}</p>

        {report.content.insights.length > 0 && (
          <ul className="space-y-2.5">
            {report.content.insights.map((insight) => {
              const meta = KIND_META[insight.kind];
              const Icon = meta.icon;

              return (
                <li
                  key={insight.id}
                  className="rounded-md border border-border bg-surface-sunken p-3"
                >
                  <div className="flex items-start gap-2.5">
                    <Icon
                      className={cn("mt-0.5 size-4 shrink-0", meta.className)}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-text">{insight.title}</p>
                      <p className="mt-1 text-sm text-text-muted">{insight.detail}</p>

                      {insight.evidence.length > 0 && (
                        <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                          {insight.evidence.map((item) => (
                            <div key={item.label} className="flex items-baseline gap-1.5">
                              <dt className="text-xs text-text-subtle">{item.label}</dt>
                              <dd className="text-xs font-medium tabular-nums text-text">
                                {item.value}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {report.content.recommendations.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold tracking-wide text-text-muted uppercase">
              Worth trying
            </h3>
            <ul className="mt-2 space-y-1.5">
              {report.content.recommendations.map((recommendation) => (
                <li key={recommendation} className="flex gap-2 text-sm text-text">
                  <Lightbulb
                    className="mt-0.5 size-4 shrink-0 text-accent"
                    aria-hidden="true"
                  />
                  <span>{recommendation}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}
