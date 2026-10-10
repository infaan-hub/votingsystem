import { NextResponse } from "next/server";
import { ApiError, unauthenticated } from "@/src/lib/http";
import {
  authenticateRequest,
  requireStateAdmin,
  type RequestState,
} from "@/src/lib/auth";

export type RouteContext = { params: Promise<Record<string, string>> };

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type ApiHandler = (
  req: Request,
  params: Record<string, string>,
  state: RequestState,
) => Promise<Response>;

export type Permission = "public" | "authenticated" | "admin";

export type ViewConfig = {
  permission?: Permission;
  intParams?: string[];
  handlers: Partial<Record<HttpMethod, ApiHandler>>;
};

const METHOD_ORDER: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

function allowHeader(handlers: Partial<Record<HttpMethod, ApiHandler>>): string {
  const allowed: string[] = [];
  for (const method of METHOD_ORDER) {
    if (method === "GET") {
      if (handlers.GET) allowed.push("GET", "HEAD");
      continue;
    }
    if (handlers[method]) allowed.push(method);
  }
  allowed.push("OPTIONS");
  return allowed.join(", ");
}

function jsonError(status: number, detail: string): ApiError {
  return new ApiError(status, { detail });
}

export function makeRoute(config: ViewConfig) {
  const permission = config.permission ?? "public";
  const handlers = config.handlers;
  const allow = allowHeader(handlers);

  const dispatch = async (
    req: Request,
    context: RouteContext,
  ): Promise<Response> => {
    let params: Record<string, string> = {};
    try {
      params = await context.params;
    } catch {
      params = {};
    }

    try {
      if (config.intParams) {
        for (const key of config.intParams) {
          const raw = params[key];
          if (raw === undefined || !/^-?\d+$/.test(raw)) {
            throw jsonError(404, `No resource matches the given identifier.`);
          }
        }
      }

      const state = await authenticateRequest(req);

      if (permission === "authenticated" && !state.user) throw unauthenticated();
      if (permission === "admin") {
        if (!state.user) throw unauthenticated();
        requireStateAdmin(state);
      }

      if (req.method === "OPTIONS") {
        return new NextResponse(null, {
          status: 200,
          headers: {
            Allow: allow,
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": allow,
            "Access-Control-Allow-Headers": "Authorization, Content-Type",
            "Access-Control-Max-Age": "86400",
            ...SECURITY_HEADERS,
          },
        });
      }

      const key = req.method === "HEAD" && handlers.GET ? "GET" : req.method;
      const handler = handlers[key as HttpMethod];
      if (!handler) {
        throw jsonError(405, `Method "${req.method}" not allowed.`);
      }
      const response = await handler(req, params, state);
      const headers = new Headers(response.headers);
      for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
        if (!headers.has(k)) headers.set(k, v);
      }
      return new Response(response.body, { status: response.status, headers });
    } catch (error) {
      if (error instanceof ApiError) {
        const headers: Record<string, string> = { ...error.headers };
        const contentType = headers["Content-Type"] ?? "";
        if (contentType.includes("text/html")) {
          return new Response(String(error.body), { status: error.status, headers });
        }
        headers.Allow = headers.Allow ?? allow;
        if (error.status === 401) headers["WWW-Authenticate"] = "Token";
        for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
          if (!headers[k]) headers[k] = v;
        }
        return NextResponse.json(error.body, { status: error.status, headers });
      }
      console.error("API handler failed:", error);
      return NextResponse.json(
        { detail: "A server error occurred." },
        { status: 500, headers: { Allow: allow, ...SECURITY_HEADERS } },
      );
    }
  };

  return dispatch;
}

export function json(body: unknown, status = 200): Response {
  return NextResponse.json(body, { status });
}

export function noContent(): Response {
  return new NextResponse(null, { status: 204 });
}