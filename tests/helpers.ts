import { prisma } from "@/src/lib/db";

export type RouteHandler = (
  req: Request,
  context: { params: Promise<Record<string, string>> },
) => Promise<Response>;

export function makeContext(params: Record<string, string> = {}) {
  return { params: Promise.resolve(params) };
}

export async function call(
  handler: RouteHandler,
  req: Request,
  params: Record<string, string> = {},
): Promise<Response> {
  return handler(req, makeContext(params));
}

export function jsonRequest(
  url: string,
  init: {
    method?: string;
    body?: unknown;
    token?: string;
    headers?: Record<string, string>;
  } = {},
): Request {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...init.headers,
  };
  if (init.token) headers.Authorization = `Token ${init.token}`;
  return new Request(`http://localhost${url}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

export function multipartRequest(
  url: string,
  options: {
    method?: string;
    token?: string;
    fields?: Record<string, string>;
    files?: Record<string, { name: string; type: string; bytes: Uint8Array }>;
  } = {},
): Request {
  const form = new FormData();
  for (const [key, value] of Object.entries(options.fields ?? {})) {
    form.append(key, value);
  }
  for (const [key, file] of Object.entries(options.files ?? {})) {
    form.append(key, new File([new Uint8Array(file.bytes)], file.name, { type: file.type }));
  }
  const headers: Record<string, string> = {};
  if (options.token) headers.Authorization = `Token ${options.token}`;
  return new Request(`http://localhost${url}`, {
    method: options.method ?? "POST",
    headers,
    body: form,
  });
}

export async function resetDb(): Promise<void> {
  // Single TRUNCATE pass is dramatically faster than per-table deleteMany
  // loops and resets identity sequences so tests start from id 1.
  await prisma.$executeRawUnsafe(`
    DO $$
    DECLARE r RECORD;
    BEGIN
      FOR r IN (
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
      ) LOOP
        EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' RESTART IDENTITY CASCADE';
      END LOOP;
    END $$;
  `);
}

export async function createTokenFor(userId: number): Promise<string> {
  const existing = await prisma.token.findUnique({ where: { userId } });
  if (existing) return existing.key;
  const token = await prisma.token.create({
    data: {
      key: `test-token-${userId}-${Math.random().toString(36).slice(2)}`,
      userId,
    },
  });
  return token.key;
}
