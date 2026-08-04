import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DayDetailView } from "@/features/calendar/day-detail-view";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ date: string }>;
}): Promise<Metadata> {
  const { date } = await params;
  return { title: ISO_DATE.test(date) ? date : "Day" };
}

export default async function DayDetailPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;

  // The date is part of the URL, so it is user input. Rejecting a malformed
  // value here keeps it from reaching the timezone helpers, which would produce
  // an Invalid Date and render a page full of dashes rather than an honest 404.
  if (!ISO_DATE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    notFound();
  }

  return <DayDetailView date={date} />;
}
