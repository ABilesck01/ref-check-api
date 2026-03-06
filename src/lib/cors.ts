const allowedOrigins = (process.env.CORS_ORIGIN ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function resolveAllowedOrigin(origin: string | null) {
  if (!origin) return null;

  // Se quiser liberar localhost em dev mesmo sem env:
  if (allowedOrigins.length === 0) {
    const devOrigins = [
      "http://localhost:3000",
      "http://localhost:3001",
      "http://127.0.0.1:3000",
      "http://127.0.0.1:3001",
    ];
    return devOrigins.includes(origin) ? origin : null;
  }

  return allowedOrigins.includes(origin) ? origin : null;
}

export function getCorsHeaders(origin: string | null) {
  const allowOrigin = resolveAllowedOrigin(origin);

  const headers: Record<string, string> = {
    Vary: "Origin",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  if (allowOrigin) {
    headers["Access-Control-Allow-Origin"] = allowOrigin;
  }

  return headers;
}

export function withCors(req: Request, res: Response) {
  const origin = req.headers.get("origin");
  const headers = new Headers(res.headers);

  const cors = getCorsHeaders(origin);
  Object.entries(cors).forEach(([k, v]) => headers.set(k, v));

  return new Response(res.body, {
    status: res.status,
    headers,
  });
}

export function corsPreflight(req: Request) {
  const origin = req.headers.get("origin");
  const headers = new Headers();

  const cors = getCorsHeaders(origin);
  Object.entries(cors).forEach(([k, v]) => headers.set(k, v));

  return new Response(null, {
    status: 204,
    headers,
  });
}