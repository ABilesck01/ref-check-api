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

export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> }
)
{
    const { code } = await context.params;

    const { data, error } = await supabase
    .from("sessions")
    .select(`
      id,
      code,
      name,
      created_at,
      started_at,
      ended_at,
      isActive,
      created_by_trainer_id,
      referee_id,
      session_situations (
        id,
        order_index,
        spawned_at,
        isActive,
        situation:situations (
          id,
          code,
          title,
          description,
          expected_decision,
          isActive
        )
      )
    `)
    .eq("code", code)
    .maybeSingle();

    if (error) {
        return withCors(request, NextResponse.json({ error: error.message }, { status: 500 }));
    }

    if (!data) {
        return withCors(request, NextResponse.json({ error: "Session not found" }, { status: 404 }));
    }

    const ordered = data.session_situations
    ?.slice()
    .sort((a: any, b: any) => a.order_index - b.order_index);

    return withCors(request, NextResponse.json({
        id: data.id,
        code: data.code,
        name: data.name,
        createdAt: data.created_at,
        startedAt: data.started_at,
        endedAt: data.ended_at,
        isActive: data.isActive,
        createdByTrainerId: data.created_by_trainer_id,
        refereeId: data.referee_id,
        situations: ordered?.map((ss: any) => ({
        sessionSituationId: ss.id,
        orderIndex: ss.order_index,
        spawnedAt: ss.spawned_at,
        isActive: ss.isActive,
        situation: ss.situation
        }))
    }));
}