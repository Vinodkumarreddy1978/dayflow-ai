import { Card } from "@/components/ui/card";

/**
 * Placeholder for a route that exists in navigation but has not been built.
 *
 * Deliberately explicit about what is missing and what to use instead. A blank
 * screen or a spinner that never resolves reads as a bug; this reads as a
 * roadmap, which is the truth.
 */
export function NotBuiltYet({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-text">{title}</h1>
      </header>

      <Card className="p-6">
        <p className="text-sm text-text-muted">{description}</p>
        <p className="mt-3 text-xs text-text-subtle">
          Not built yet. Recording activities and the dashboard both work today.
        </p>
      </Card>
    </div>
  );
}
