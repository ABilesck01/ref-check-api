import { NextResponse } from "next/server";
import { getCorsHeaders, withCors } from "@/lib/cors";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  return new Response(null, { status: 204, headers: getCorsHeaders(origin) });
}

type Body = {
  name: string;
  email?: string | null;
  createdByTrainerId: string;
};

export async function POST(req: Request) {
  let body: Body;

  try {
    body = await req.json();
  } catch {
    return withCors(
      req,
      NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    );
  }

  if (!body.name) {
    return withCors(
      req,
      NextResponse.json({ error: "name is required" }, { status: 400 })
    );
  }

  if (!body.createdByTrainerId) {
    return withCors(
      req,
      NextResponse.json(
        { error: "createdByTrainerId is required" },
        { status: 400 }
      )
    );
  }

  const { data, error } = await supabase
    .from("users")
    .insert({
      name: body.name,
      email: body.email ?? null,
      role: "referee",
      created_by_trainer_id: body.createdByTrainerId,
      isActive: true,
    })
    .select("id, name, email, created_at, isActive")
    .single();

  if (error) {
    return withCors(
      req,
      NextResponse.json({ error: error.message }, { status: 500 })
    );
  }

  return withCors(
    req,
    NextResponse.json(data, { status: 201 })
  );
}

export async function GET(req: Request) {
  const url = new URL(req.url);

  const trainerId = url.searchParams.get("trainerId");
  const isActiveParam = url.searchParams.get("isActive");

  if (!trainerId) {
    return withCors(
      req,
      NextResponse.json({ error: "trainerId is required" }, { status: 400 })
    );
  }

  let q = supabase
    .from("users")
    .select("id, name, email, role, created_at, isActive, created_by_trainer_id")
    .eq("role", "referee")
    .eq("created_by_trainer_id", trainerId)
    .order("created_at", { ascending: false });

  if (isActiveParam === "true") q = q.eq("isActive", true);
  if (isActiveParam === "false") q = q.eq("isActive", false);

  const { data, error } = await q;

  if (error) {
    return withCors(
      req,
      NextResponse.json({ error: error.message }, { status: 500 })
    );
  }

  return withCors(
    req,
    NextResponse.json({ items: data ?? [] }, { status: 200 })
  );
}