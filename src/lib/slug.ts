/**
 * URL-safe slug helpers. Slugs are the public, stable identifier used in
 * routes such as `/vote/[slug]`, so they must be unique per election.
 */

const COMBINING_MARKS = /[̀-ͯ]/g;

export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return base || "election";
}