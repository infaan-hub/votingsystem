import { prisma } from "@/src/lib/db";
import crypto from "node:crypto";

const TOKEN_ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export function generateTokenKey(): string {
  let key = "";
  for (let i = 0; i < 40; i += 1) {
    key += TOKEN_ALPHABET[crypto.randomInt(TOKEN_ALPHABET.length)];
  }
  return key;
}

/** One stable token key per user, created on first request. */
export async function getOrCreateToken(userId: number): Promise<{ key: string }> {
  const existing = await prisma.token.findUnique({ where: { userId } });
  if (existing) return existing;
  try {
    return await prisma.token.create({
      data: { key: generateTokenKey(), userId },
    });
  } catch {
    const raced = await prisma.token.findUnique({ where: { userId } });
    if (raced) return raced;
    throw new Error("Unable to create authentication token");
  }
}
