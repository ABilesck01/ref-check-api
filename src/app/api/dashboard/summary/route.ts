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

export async function GET(req: Request) {
  const url = new URL(req.url);
  const trainerId = url.searchParams.get("trainerId");
  const daysParam = url.searchParams.get("days");
  const days = Math.max(1, Math.min(365, Number(daysParam ?? "30") || 30));

  if (!trainerId) {
    return withCors(req, NextResponse.json({ error: "trainerId is required" }, { status: 400 }));
  }

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { count: situationsActive, error: sErr } = await supabase
    .from("situations")
    .select("id", { count: "exact", head: true })
    .eq("isActive", true);

  if (sErr) return withCors(req, NextResponse.json({ error: sErr.message }, { status: 500 }));

  const { count: sessionsTotal, error: stErr } = await supabase
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .eq("created_by_trainer_id", trainerId);

  if (stErr) return withCors(req, NextResponse.json({ error: stErr.message }, { status: 500 }));

  const { count: sessionsActive, error: saErr } = await supabase
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .eq("created_by_trainer_id", trainerId)
    .eq("isActive", true);

  if (saErr) return withCors(req, NextResponse.json({ error: saErr.message }, { status: 500 }));

  const { data: sessionIds, error: idsErr } = await supabase
    .from("sessions")
    .select("id")
    .eq("created_by_trainer_id", trainerId)
    .gte("created_at", since);

  if (idsErr) return withCors(req, NextResponse.json({ error: idsErr.message }, { status: 500 }));

  const ids = (sessionIds ?? []).map((x: any) => x.id);
  let decisionsTotal = 0;
  let decisionsCorrect = 0;

  if (ids.length > 0) {
    const { data: ssRows, error: ssErr } = await supabase
      .from("session_situations")
      .select("id, session_id")
      .in("session_id", ids);

    if (ssErr) return withCors(req, NextResponse.json({ error: ssErr.message }, { status: 500 }));

    const ssIds = (ssRows ?? []).map((x: any) => x.id);

    if (ssIds.length > 0) {
      const { data: decisions, error: dErr } = await supabase
        .from("decisions")
        .select("id, is_correct")
        .in("session_situation_id", ssIds);

      if (dErr) return withCors(req, NextResponse.json({ error: dErr.message }, { status: 500 }));

      decisionsTotal = (decisions ?? []).length;
      decisionsCorrect = (decisions ?? []).filter((d: any) => d.is_correct).length;
    }
  }

  const accuracy = decisionsTotal > 0 ? decisionsCorrect / decisionsTotal : null;

  const { data: recentSessions, error: rErr } = await supabase
    .from("sessions")
    .select("id, code, name, isActive, created_at, ended_at, referee_id")
    .eq("created_by_trainer_id", trainerId)
    .order("created_at", { ascending: false })
    .limit(8);

  if (rErr) return withCors(req, NextResponse.json({ error: rErr.message }, { status: 500 }));

  return withCors(
    req,
    NextResponse.json(
      {
        kpis: {
          situationsActive: situationsActive ?? 0,
          sessionsTotal: sessionsTotal ?? 0,
          sessionsActive: sessionsActive ?? 0,
          decisionsTotal,
          decisionsCorrect,
          accuracy,
          windowDays: days,
        },
        recentSessions: recentSessions ?? [],
      },
      { status: 200 }
    )
  );
}