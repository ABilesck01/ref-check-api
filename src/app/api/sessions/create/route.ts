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

function generateCode6() {
  // alfanumérico, sem caracteres confusos
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

type CreateSessionBody = {
  name?: string | null;
  refereeId: string;           // uuid
  createdByTrainerId: string;  // uuid
  // opcional: lista de situationIds pra já montar a sessão:
  situationIds?: string[];
};

export async function POST(req: Request)
{
    let body: CreateSessionBody;
    try {
        body = await req.json();
    } catch {
        return withCors(req, NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }));
    }

    if (!body.refereeId) 
        return withCors(req, NextResponse.json({ error: "refereeId is required" }, { status: 400 }));
    if (!body.createdByTrainerId) 
        return withCors(req, NextResponse.json({ error: "createdByTrainerId is required" }, { status: 400 }));

    let code = "";
    for (let attempt = 0; attempt < 10; attempt++) {
        const candidate = generateCode6();

        const { data: exists, error: existsErr } = await supabase
        .from("sessions")
        .select("id")
        .eq("code", candidate)
        .maybeSingle();

        if (existsErr) 
            return withCors(req, NextResponse.json({ error: existsErr.message }, { status: 500 }));
        if (!exists) {
        code = candidate;
        break;
        }
    }

    if (!code) {
        return withCors(req, NextResponse.json({ error: "Could not generate unique code" }, { status: 500 }));
    }

    const { data: createdSession, error: createErr } = await supabase
        .from("sessions")
        .insert({
        code,
        name: body.name ?? null,
        referee_id: body.refereeId,
        created_by_trainer_id: body.createdByTrainerId,
        isActive: true,
        })
        .select("id, code, name, referee_id, created_by_trainer_id, created_at, isActive")
        .maybeSingle();

    if (createErr) 
        return withCors(req, NextResponse.json({ error: createErr.message }, { status: 500 }));

    if (body.situationIds?.length) {
        const rows = body.situationIds.map((sid, idx) => ({
        session_id: createdSession!.id,
        situation_id: sid,
        order_index: idx,
        isActive: true,
        }));

        const { error: ssErr } = await supabase.from("session_situations").insert(rows);
        if (ssErr) {
        // se falhar aqui, você pode decidir: rollback manual ou só retornar erro
        return withCors(req, NextResponse.json({ error: ssErr.message }, { status: 500 }));
        }
    }

    return withCors(req, NextResponse.json(
        {
        id: createdSession!.id,
        code: createdSession!.code,
        name: createdSession!.name,
        refereeId: createdSession!.referee_id,
        createdByTrainerId: createdSession!.created_by_trainer_id,
        createdAt: createdSession!.created_at,
        isActive: createdSession!.isActive,
        },
        { status: 201 }
    ));
}