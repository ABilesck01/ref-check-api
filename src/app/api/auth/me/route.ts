import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

function getBearer(req: Request) {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1];
}

export async function GET(req: Request) {
  const token = getBearer(req);
  if (!token) return NextResponse.json({ ok: false, error: "missing token" }, { status: 401 });

  const supabase = supabaseServer();
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return NextResponse.json({ ok: false, error: "invalid token" }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    user: { id: data.user.id, email: data.user.email },
  });
}