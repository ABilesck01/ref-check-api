import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCorsHeaders, withCors } from "@/lib/cors";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl!, serviceKey!);

export async function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  return new Response(null, { status: 204, headers: getCorsHeaders(origin) });
}

export async function GET(
  req: Request,
  context: { params: Promise<{ code: string }> }
) {
  try {
    if (!supabaseUrl || !serviceKey) {
      return withCors(req,
        NextResponse.json(
          { error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" },
          { status: 500 }
        )
      );
    }

    const { code } = await context.params;

    if (!code) {
      return withCors(req,
        NextResponse.json({ error: "code is required" }, { status: 400 })
      );
    }

    const { data: session, error: sErr } = await supabase
      .from("sessions")
      .select("id, code, name")
      .eq("code", code)
      .maybeSingle();

    if (sErr) {
      return withCors(req,
        NextResponse.json({ error: sErr.message }, { status: 500 })
      );
    }
    if (!session) {
      return withCors(req,
        NextResponse.json({ error: "Session not found" }, { status: 404 })
      );
    }

    const { data: ssRows, error: ssErr } = await supabase
      .from("session_situations")
      .select("id")
      .eq("session_id", session.id);

    if (ssErr) {
      return withCors(req,
        NextResponse.json({ error: ssErr.message }, { status: 500 })
      );
    }

    const ssIds = (ssRows ?? []).map((r) => r.id);
    if (ssIds.length === 0) {
      return withCors(req,
        NextResponse.json({ session, items: [] }, { status: 200 })
      );
    }

    const { data: items, error: dErr } = await supabase
      .from("decisions")
      .select(`
        id,
        decided_at,
        decision_made,
        decision_time_ms,
        meters_walked,
        is_correct,
        session_situation:session_situations (
          id,
          order_index,
          situation:situations (
            id,
            title,
            expected_decision
          )
        )
      `)
      .in("session_situation_id", ssIds)
      .order("decided_at", { ascending: true });

    if (dErr) {
      return withCors(req,
        NextResponse.json({ error: dErr.message }, { status: 500 })
      );
    }

    return withCors(req,
      NextResponse.json({ session, items: items ?? [] }, { status: 200 })
    );
  } catch (e: any) {
    console.error("GET /api/sessions/[code]/decisions crashed:", e);
    return withCors(req,
      NextResponse.json({ error: e?.message ?? "Internal server error" }, { status: 500 })
    );
  }
}