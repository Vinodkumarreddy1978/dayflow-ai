/**
 * Where a failed settings save is recorded. DF-OBS-005.
 *
 * The settings write goes from the browser straight to PostgREST, which is right
 * - it is one row, guarded by row level security, and routing it through a
 * function would add a hop for nothing. The cost is that when it fails, no
 * Vercel function is involved and the failure exists only in a browser the
 * operator cannot see. That is how "UPDATE requires a WHERE clause" survived to
 * production: every save on the live site was refused, and the only account of
 * why was a toast that said the setting could not be saved.
 *
 * This route is the smallest thing that closes that gap. It accepts the database
 * error fields the browser already has and writes them through the structured
 * logger, so the cause is one search away in the function logs. It carries no
 * settings values, and the account it names is the one holding the session
 * rather than any id the request offers.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { settingsWriteFailureLog } from "@/features/settings/save-settings";

/**
 * Bounded on every field. The body is attacker-controlled even behind a session,
 * and an unbounded string here is a way to fill the log retention DF-OBS-006
 * budgets for thirty days of history.
 */
const bodySchema = z.object({
  code: z.string().max(20).nullable(),
  message: z.string().max(500).nullable(),
  hint: z.string().max(500).nullable(),
  fields: z.array(z.string().max(64)).max(64),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Malformed report." }, { status: 400 });
  }

  logger.error("Settings write failed", settingsWriteFailureLog(parsed.data, user.id));

  return NextResponse.json({ ok: true });
}
