import { NextResponse } from "next/server";
import { ApiError, htmlNotFound, unauthenticated } from "@/src/lib/http";
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
  /** Integer URL params: rejects anything that is not a bare decimal integer. */
  intParams?: string[];
  handlers: Partial<Record<HttpMethod, ApiHandler>>;
};

const METHOD_ORDER: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

/** `HEAD` is auto-allowed wherever `GET` is, matching conventional REST routers. */
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

/**
 * Builds a Next.js route module that dispatches like a conventional REST
 * handler: URL-converter checks run first (a non-integer id returns the HTML
 * 404 page before any handler logic), then permission, then the method.
 * Every response, including errors, carries an `Allow` header.
 */
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
            throw htmlNotFound();
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
          headers: { Allow: allow },
        });
      }

      const key = req.method === "HEAD" && handlers.GET ? "GET" : req.method;
      const handler = handlers[key as HttpMethod];
      if (!handler) {
        throw new ApiError(405, { detail: `Method "${req.method}" not allowed.` }, { Allow: allow });
      }
      return await handler(req, params, state);
    } catch (error) {
      if (error instanceof ApiError) {
        const headers: Record<string, string> = { ...error.headers };
        const contentType = headers["Content-Type"] ?? "";
        if (contentType.includes("text/html")) {
          return new Response(String(error.body), {
            status: error.status,
            headers,
          });
        }
        headers.Allow = headers.Allow ?? allow;
        if (error.status === 401) headers["WWW-Authenticate"] = "Token";
        return NextResponse.json(error.body, { status: error.status, headers });
      }
      console.error("API handler failed:", error);
      return NextResponse.json(
        { detail: "A server error occurred." },
        { status: 500, headers: { Allow: allow } },
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
