import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function toInt(v: string | null, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function GET(req: Request) {
  const url = new URL(req.url);

  // Query params
  const page = Math.max(1, toInt(url.searchParams.get("page"), 1));
  const pageSize = Math.min(100, Math.max(1, toInt(url.searchParams.get("pageSize"), 20)));
  const isActiveParam = url.searchParams.get("isActive"); // "true" | "false" | null
  const createdByTrainerId = url.searchParams.get("createdByTrainerId"); // opcional
  const refereeId = url.searchParams.get("refereeId"); // opcional
  const q = (url.searchParams.get("q") || "").trim(); // busca simples por code/nome

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("sessions")
    .select(`
        id,
        code,
        name,
        created_at,
        started_at,
        ended_at,
        isActive,

        referee:users!sessions_referee_id_fkey (
            id,
            name
        ),

        trainer:users!sessions_created_by_trainer_id_fkey (
            id,
            name
        )
        `, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (isActiveParam === "true") query = query.eq("isActive", true);
  if (isActiveParam === "false") query = query.eq("isActive", false);

  if (createdByTrainerId) query = query.eq("created_by_trainer_id", createdByTrainerId);
  if (refereeId) query = query.eq("referee_id", refereeId);

  if (q) {
    // Supabase/PostgREST: or() precisa ser string
    // ilike suporta busca case-insensitive
    query = query.or(`code.ilike.%${q}%,name.ilike.%${q}%`);
  }

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    page,
    pageSize,
    total: count ?? 0,
    items: (data ?? []).map((s: any) => ({
        id: s.id,
        code: s.code,
        name: s.name,
        createdAt: s.created_at,
        startedAt: s.started_at,
        endedAt: s.ended_at,
        isActive: s.isActive,

        refereeName: s.referee?.name ?? null,
        trainerName: s.trainer?.name ?? null,
    })),
  });
}