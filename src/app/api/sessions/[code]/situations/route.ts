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
  situationIds: string[];
  replace?: boolean; // default true
};

export async function POST(
  req: Request,
  context: { params: Promise<{ code: string }> }
) {
  const { code } = await context.params;

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return withCors(req,NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }));
  }

  const situationIds = Array.isArray(body.situationIds) ? body.situationIds : [];
  const replace = body.replace !== false;

  if (!code) {
    return withCors(req,NextResponse.json({ error: "code is required" }, { status: 400 }));
  }
  if (situationIds.length === 0) {
    return withCors(req,NextResponse.json({ error: "situationIds is required" }, { status: 400 }));
  }

  // 1) encontra a sessão pelo CODE
  const { data: session, error: sErr } = await supabase
    .from("sessions")
    .select("id")
    .eq("code", code)
    .maybeSingle();

  if (sErr) return withCors(req,NextResponse.json({ error: sErr.message }, { status: 500 }));
  if (!session) return withCors(req,NextResponse.json({ error: "Session not found" }, { status: 404 }));

  const sessionId = session.id;

  // 2) replace: apaga as existentes
  if (replace) {
    const { error: delErr } = await supabase
      .from("session_situations")
      .delete()
      .eq("session_id", sessionId);

    if (delErr) return withCors(req,NextResponse.json({ error: delErr.message }, { status: 500 }));
  }

  // 3) insere em ordem
  const rows = situationIds.map((sid, idx) => ({
    session_id: sessionId,
    situation_id: sid,
    order_index: idx,
    isActive: true,
  }));

  const { error: insErr } = await supabase.from("session_situations").insert(rows);
  if (insErr) return withCors(req,NextResponse.json({ error: insErr.message }, { status: 500 }));

  return withCors(req,
    NextResponse.json({ ok: true, code, added: situationIds.length }, { status: 200 })
  );
}
