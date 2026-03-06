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

// GET /api/reports/trainees/summary?trainerId=...&days=30
export async function GET(req: Request) {
  const url = new URL(req.url);
  const trainerId = url.searchParams.get("trainerId");
  const days = Math.max(1, Math.min(365, Number(url.searchParams.get("days") ?? "30") || 30));

  if (!trainerId) {
    return withCors(req, NextResponse.json({ error: "trainerId is required" }, { status: 400 }));
  }

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  // 1) treinandos do trainer
  const { data: trainees, error: tErr } = await supabase
    .from("users")
    .select("id, name, email, isActive, created_at")
    .eq("role", "referee")
    .eq("created_by_trainer_id", trainerId)
    .eq("isActive", true)
    .order("name", { ascending: true });

  if (tErr) return withCors(req, NextResponse.json({ error: tErr.message }, { status: 500 }));

  const traineeIds = (trainees ?? []).map((t: any) => t.id);

  // 2) sessões no período
  const { data: sessions, error: sErr } = await supabase
    .from("sessions")
    .select("id, referee_id")
    .eq("created_by_trainer_id", trainerId)
    .gte("created_at", since);

  if (sErr) return withCors(req, NextResponse.json({ error: sErr.message }, { status: 500 }));

  const sessionIds = (sessions ?? []).map((s: any) => s.id);

  // 3) session_situations dessas sessões
  let ssIds: string[] = [];
  if (sessionIds.length > 0) {
    const { data: ssRows, error: ssErr } = await supabase
      .from("session_situations")
      .select("id, session_id")
      .in("session_id", sessionIds);

    if (ssErr) return withCors(req, NextResponse.json({ error: ssErr.message }, { status: 500 }));
    ssIds = (ssRows ?? []).map((x: any) => x.id);
  }

  // 4) decisões e agregação
  // Vamos trazer decisões no período (via sessões) e depois agregar em JS por referee_id.
  let decisions: any[] = [];
  if (ssIds.length > 0) {
    const { data: dRows, error: dErr } = await supabase
      .from("decisions")
      .select("session_situation_id, is_correct, decision_time_ms")
      .in("session_situation_id", ssIds);

    if (dErr) return withCors(req, NextResponse.json({ error: dErr.message }, { status: 500 }));
    decisions = dRows ?? [];
  }

  // mapa sessionId -> refereeId
  const sessionToReferee = new Map<string, string>();
  for (const s of sessions ?? []) sessionToReferee.set(s.id, s.referee_id);

  // Precisamos do session_id por session_situation_id:
  // buscamos novamente ssRows com session_id (se já buscou, reusa)
  let ssToSession = new Map<string, string>();
  if (sessionIds.length > 0) {
    const { data: ssRows2 } = await supabase
      .from("session_situations")
      .select("id, session_id")
      .in("session_id", sessionIds);
    for (const r of ssRows2 ?? []) ssToSession.set(r.id, r.session_id);
  }

  const agg = new Map<string, { total: number; correct: number; timeSum: number; timeCount: number; sessions: Set<string> }>();
  for (const id of traineeIds) {
    agg.set(id, { total: 0, correct: 0, timeSum: 0, timeCount: 0, sessions: new Set() });
  }

  for (const d of decisions) {
    const ssId = d.session_situation_id as string;
    const sessionId = ssToSession.get(ssId);
    if (!sessionId) continue;

    const refereeId = sessionToReferee.get(sessionId);
    if (!refereeId) continue;

    if (!agg.has(refereeId)) continue;

    const a = agg.get(refereeId)!;
    a.total += 1;
    if (d.is_correct) a.correct += 1;
    if (typeof d.decision_time_ms === "number") {
      a.timeSum += d.decision_time_ms;
      a.timeCount += 1;
    }
    a.sessions.add(sessionId);
  }

  const items = (trainees ?? []).map((t: any) => {
    const a = agg.get(t.id) ?? { total: 0, correct: 0, timeSum: 0, timeCount: 0, sessions: new Set() };
    const accuracy = a.total > 0 ? a.correct / a.total : null;
    const avgTimeMs = a.timeCount > 0 ? Math.round(a.timeSum / a.timeCount) : null;

    return {
      id: t.id,
      name: t.name,
      email: t.email,
      totalDecisions: a.total,
      correctDecisions: a.correct,
      accuracy,
      avgDecisionTimeMs: avgTimeMs,
      sessionsCount: a.sessions.size,
    };
  });

  // ordena por acurácia desc, depois totalDecisions desc
  items.sort((a: any, b: any) => {
    const aa = a.accuracy ?? -1;
    const bb = b.accuracy ?? -1;
    if (bb !== aa) return bb - aa;
    return (b.totalDecisions ?? 0) - (a.totalDecisions ?? 0);
  });

  return withCors(req, 
    NextResponse.json({ windowDays: days, items }, { status: 200 })
  );
}