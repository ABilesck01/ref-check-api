import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { withCors, getCorsHeaders } from "@/lib/cors";

export async function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  return new Response(null, { status: 204, headers: getCorsHeaders(origin) });
}

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return withCors(
        req,
        NextResponse.json({ ok: false, error: "email and password required" }, { status: 400 })
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !data.session) {
      return withCors(
        req,
        NextResponse.json({ ok: false, error: error?.message ?? "invalid login" }, { status: 401 })
      );
    }

    return withCors(
      req,
      NextResponse.json({
        ok: true,
        user: data.user,
        session: {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_in: data.session.expires_in,
          expires_at: data.session.expires_at,
          token_type: data.session.token_type,
        },
      })
    );
  } catch (e: any) {
    // isso evita “ERR_FAILED” por crash sem resposta
    return withCors(
      req,
      NextResponse.json({ ok: false, error: e?.message ?? "internal error" }, { status: 500 })
    );
  }
}