import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCorsHeaders, withCors } from "@/lib/cors";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  return new Response(null, { status: 204, headers: getCorsHeaders(origin) });
}

type Body = {
  sessionSituationId: string;
  decisionMade: string;
  decisionTimeMs?: number;
  metersWalked?: number;
  decidedAt?: string;     // ISO opcional
  isCorrect?: boolean;    // opcional (senão calculamos)
};

function asNonEmptyString(v: unknown) {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}
function asNonNegInt(v: unknown) {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null;
}
function asNumber(v: unknown) {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return withCors(req, NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }));
  }

  const sessionSituationId = asNonEmptyString(body.sessionSituationId);
  const decisionMade = asNonEmptyString(body.decisionMade);

  if (!sessionSituationId) {
    return withCors(req, NextResponse.json({ error: "sessionSituationId is required" }, { status: 400 }));
  }
  if (!decisionMade) {
    return withCors(req, NextResponse.json({ error: "decisionMade is required" }, { status: 400 }));
  }

  const decisionTimeMs = asNonNegInt(body.decisionTimeMs);
  const metersWalked = asNumber(body.metersWalked);
  const decidedAt = asNonEmptyString(body.decidedAt) ?? new Date().toISOString();

  // calcula isCorrect se não vier
  let isCorrect: boolean | null = typeof body.isCorrect === "boolean" ? body.isCorrect : null;

  if (isCorrect === null) {
    const { data: ss, error: ssErr } = await supabase
      .from("session_situations")
      .select(`
        id,
        situation:situations ( expected_decision )
      `)
      .eq("id", sessionSituationId)
      .maybeSingle();

    if (ssErr) return withCors(req, NextResponse.json({ error: ssErr.message }, { status: 500 }));
    if (!ss) return withCors(req, NextResponse.json({ error: "SessionSituation not found" }, { status: 404 }));

    const expected = (ss as any)?.situation?.expected_decision;
    isCorrect =
      expected != null &&
      String(decisionMade).trim().toUpperCase() === String(expected).trim().toUpperCase();
  }

  const { data: created, error: insErr } = await supabase
    .from("decisions")
    .insert({
      session_situation_id: sessionSituationId,
      decision_made: decisionMade,
      decided_at: decidedAt,
      decision_time_ms: decisionTimeMs,
      meters_walked: metersWalked,
      is_correct: isCorrect,
    })
    .select("id, session_situation_id, decision_made, decided_at, decision_time_ms, meters_walked, is_correct")
    .maybeSingle();

  if (insErr) return withCors(req, NextResponse.json({ error: insErr.message }, { status: 500 }));

  return withCors(req, 
    NextResponse.json(
      {
        id: created?.id,
        sessionSituationId: created?.session_situation_id,
        decisionMade: created?.decision_made,
        decidedAt: created?.decided_at,
        decisionTimeMs: created?.decision_time_ms,
        metersWalked: created?.meters_walked,
        isCorrect: created?.is_correct,
      },
      { status: 201 }
    )
  );
}
