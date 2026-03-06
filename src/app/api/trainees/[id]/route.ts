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

// PATCH /api/trainees/:id
// body: { name?: string, email?: string, isActive?: boolean }
export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const body = await req.json().catch(() => null);

  const update: Record<string, any> = {};
  if (body?.name !== undefined) update.name = body.name;
  if (body?.email !== undefined) update.email = body.email;
  if (body?.isActive !== undefined) update.isActive = body.isActive;

  if (!id) {
    return withCors(req,NextResponse.json({ error: "id is required" }, { status: 400 }));
  }
  if (Object.keys(update).length === 0) {
    return withCors(req,
      NextResponse.json({ error: "nothing to update" }, { status: 400 })
    );
  }

  const { data, error } = await supabase
    .from("users")
    .update(update)
    .eq("id", id)
    .select("id, name, email, role, created_at, isActive, created_by_trainer_id")
    .single();

  if (error) return withCors(req, NextResponse.json({ error: error.message }, { status: 500 }));

  return withCors(req, NextResponse.json({ item: data }, { status: 200 }));
}

// DELETE /api/trainees/:id  (soft delete)
export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  if (!id) {
    return withCors(_req, NextResponse.json({ error: "id is required" }, { status: 400 }));
  }

  const { error } = await supabase
    .from("users")
    .update({ isActive: false })
    .eq("id", id);

  if (error) return withCors(_req, NextResponse.json({ error: error.message }, { status: 500 }));

  return withCors(_req, NextResponse.json({ ok: true }, { status: 200 }));
}