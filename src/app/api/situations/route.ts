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

export async function GET(req: Request)
{
    const url = new URL(req.url);
    const isActiveParam = url.searchParams.get("isActive"); // "true" | "false" | null

    let q = supabase
        .from("situations")
        .select("id, code, title, description, expected_decision, isActive, created_at")
        .order("created_at", { ascending: false });
    
    if (isActiveParam === "true") q = q.eq("isActive", true);
    if (isActiveParam === "false") q = q.eq("isActive", false);

    const { data, error } = await q;
    if (error) return withCors(req, NextResponse.json({ error: error.message }, { status: 500 }));

    return withCors(req, NextResponse.json({ items: data ?? [] }, { status: 200 }));
}