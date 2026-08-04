import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST only. A GET sign-out can be triggered by any image tag or link prefetch
 * on a page the user visits, which turns signing out into something that happens
 * to them rather than something they do.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  return NextResponse.redirect(`${request.nextUrl.origin}/sign-in`, {
    // 303 forces the browser to follow with GET rather than repeating the POST.
    status: 303,
  });
}
