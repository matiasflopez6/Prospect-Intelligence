import { NextResponse, type NextRequest } from "next/server";
import { decideAccess } from "@/lib/auth/basic-auth";

export async function proxy(request: NextRequest) {
  const decision = await decideAccess(request.nextUrl.pathname, request.headers.get("authorization"), {
    APP_USERNAME: process.env.APP_USERNAME,
    APP_PASSWORD: process.env.APP_PASSWORD,
    RAILWAY_ENVIRONMENT: process.env.RAILWAY_ENVIRONMENT,
  });
  if (decision === "allow") return NextResponse.next();
  if (decision === "misconfigured") {
    return new NextResponse("Despliegue sin proteger: define APP_PASSWORD en las variables del servicio.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  return new NextResponse("Autenticación requerida", {
    status: 401,
    headers: { "www-authenticate": 'Basic realm="Prospect Intelligence", charset="UTF-8"', "cache-control": "no-store" },
  });
}

// Todo salvo estáticos de Next; /api/health se exime dentro de decideAccess.
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
