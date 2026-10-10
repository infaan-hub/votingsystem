import { json, makeRoute, noContent } from "@/src/lib/api";
import { fieldErrors, notFoundModel } from "@/src/lib/http";
import { Collector, strField, boolField } from "@/src/lib/fields";
import { prisma } from "@/src/lib/db";
import { readPayload, type Payload } from "@/src/lib/request";
import { serializeCategory } from "@/src/lib/serializers";
import { isUniqueConstraintViolation } from "@/src/lib/services";
import { slugify } from "@/src/lib/slug";

const CATEGORY_INCLUDE = { _count: { select: { elections: true } } } as const;

async function slugTaken(slug: string, excludeId: number): Promise<boolean> {
  const row = await prisma.electionCategory.findFirst({
    where: { slug, id: { not: excludeId } },
    select: { id: true },
  });
  return row !== null;
}

async function uniqueSlug(base: string, excludeId: number): Promise<string> {
  const root = slugify(base);
  if (!(await slugTaken(root, excludeId))) return root;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${root}-${n}`;
    if (!(await slugTaken(candidate, excludeId))) return candidate;
  }
  return `${root}-${Date.now().toString(36)}`;
}

async function loadCategory(pk: number) {
  const category = await prisma.electionCategory.findUnique({
    where: { id: pk },
    include: CATEGORY_INCLUDE,
  });
  if (!category) throw notFoundModel("ElectionCategory");
  return category;
}

const route = makeRoute({
  permission: "admin",
  intParams: ["pk"],
  handlers: {
    GET: async (_req, params) => {
      const category = await loadCategory(Number(params.pk));
      return json(serializeCategory(category));
    },
    PATCH: async (req, params) => {
      const pk = Number(params.pk);
      const existing = await loadCategory(pk);
      const payload: Payload = await readPayload(req);
      const has = (key: string) => Object.prototype.hasOwnProperty.call(payload, key);

      const c = new Collector();
      const name = has("name") ? strField(c, payload, "name", { required: false, maxLength: 120 }) : undefined;
      const slugRaw = has("slug") ? strField(c, payload, "slug", { required: false, maxLength: 120 }) : undefined;
      const description = has("description")
        ? strField(c, payload, "description", { required: false, allowBlank: true, maxLength: 1000 })
        : undefined;
      const icon = has("icon") ? strField(c, payload, "icon", { required: false, allowBlank: true, maxLength: 60 }) : undefined;
      const isActive = has("is_active") ? boolField(c, payload, "is_active", { required: false }) : undefined;
      c.throwIfAny();

      if (name !== undefined && !name) throw fieldErrors({ name: "This field may not be blank." });

      const updates: Record<string, unknown> = {};
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (icon !== undefined) updates.icon = icon;
      if (isActive !== undefined) updates.isActive = isActive;
      if (slugRaw !== undefined) updates.slug = await uniqueSlug(slugRaw, pk);
      else if (name !== undefined && name !== existing.name) updates.slug = await uniqueSlug(name, pk);

      let updated;
      try {
        updated = await prisma.electionCategory.update({
          where: { id: pk },
          data: updates,
          include: CATEGORY_INCLUDE,
        });
      } catch (error) {
        if (isUniqueConstraintViolation(error)) {
          throw fieldErrors({ name: "A category with this name already exists." });
        }
        throw error;
      }
      return json(serializeCategory(updated));
    },
    DELETE: async (_req, params) => {
      const pk = Number(params.pk);
      const category = await loadCategory(pk);
      // Guard: never delete a category that elections still reference.
      if (category._count.elections > 0) {
        throw fieldErrors({
          detail: `Cannot delete "${category.name}" because ${category._count.elections} election(s) still use it. Reassign them first.`,
        });
      }
      await prisma.electionCategory.delete({ where: { id: pk } });
      return noContent();
    },
  },
});

export const GET = route;
export const PATCH = route;
export const DELETE = route;