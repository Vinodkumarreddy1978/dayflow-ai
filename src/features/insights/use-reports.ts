"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/keys";
import { useToast } from "@/components/ui/toast";
import { isReportContent } from "./report-content";
import type { ReportContent } from "@/lib/ai/facts";
import type { AiReport } from "@/lib/supabase/database.types";

export type PeriodType = "daily" | "weekly" | "monthly";

export interface StoredReport {
  id: string;
  periodType: PeriodType;
  periodStart: string;
  periodEnd: string;
  content: ReportContent;
  generatedBy: "ai" | "deterministic";
  model: string | null;
  createdAt: string;
}

/**
 * Reports are validated on read, not just on write.
 *
 * A row written by an older version of the content schema must not crash the
 * screen. Anything that fails validation is dropped, which shows the user one
 * fewer report rather than an error page.
 *
 * The check is `isReportContent` rather than `reportContentSchema.safeParse`
 * because this file is in the client bundle and the schema brings zod with it.
 * The two are held equivalent by report-content.test.ts.
 */
function parseReport(row: AiReport): StoredReport | null {
  const content: unknown = row.content;
  if (!isReportContent(content)) return null;

  return {
    id: row.id,
    periodType: row.period_type as PeriodType,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    content,
    generatedBy: row.generated_by as "ai" | "deterministic",
    model: row.model,
    createdAt: row.created_at,
  };
}

export function useReports(periodType: PeriodType) {
  return useQuery({
    queryKey: queryKeys.reports.list(periodType),
    queryFn: async (): Promise<StoredReport[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("ai_reports")
        .select("*")
        .eq("period_type", periodType)
        .order("period_start", { ascending: false })
        .limit(24);

      if (error) throw error;

      return ((data ?? []) as AiReport[])
        .map(parseReport)
        .filter((report): report is StoredReport => report !== null);
    },
    staleTime: 60_000,
  });
}

export function useGenerateReport() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async (input: { periodType: PeriodType; periodStart: string }) => {
      const response = await fetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });

      const body = (await response.json()) as {
        error?: string;
        generatedBy?: "ai" | "deterministic";
      };

      if (!response.ok) {
        throw new Error(body.error ?? "The report could not be generated.");
      }

      return body;
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.reports.all });
      toast.success(
        result.generatedBy === "ai"
          ? "Report ready."
          : // Said out loud rather than hidden: a user who turned AI on and got a
            // deterministic report deserves to know which they are reading.
            "Report ready, written from your figures without AI.",
      );
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Report generation failed.");
    },
  });
}
