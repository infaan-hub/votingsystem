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

/**
 * Returns `base` when free, otherwise `base-2`, `base-3`, ... capped so two
 * elections with the same title still receive distinct, stable slugs.
 */
export function uniqueSlugFrom(base: string, taken: ReadonlySet<string>): string {
  const root = slugify(base);
  if (!taken.has(root)) return root;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${root}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${root}-${Date.now().toString(36)}`;
}