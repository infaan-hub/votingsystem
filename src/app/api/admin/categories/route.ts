import { json, makeRoute } from "@/src/lib/api";
import { fieldErrors } from "@/src/lib/http";
import { Collector, strField, boolField } from "@/src/lib/fields";
import { prisma } from "@/src/lib/db";
import { readPayload } from "@/src/lib/request";
import { requireStateAdmin } from "@/src/lib/auth";
import { serializeCategory } from "@/src/lib/serializers";
import { isUniqueConstraintViolation } from "@/src/lib/services";
import { slugify } from "@/src/lib/slug";

const CATEGORY_INCLUDE = { _count: { select: { elections: true } } } as const;

async function slugTaken(slug: string, excludeId?: number): Promise<boolean> {
  const row = await prisma.electionCategory.findFirst({
    where: { slug, ...(excludeId !== undefined ? { id: { not: excludeId } } : {}) },
    select: { id: true },
  });
  return row !== null;
}

async function uniqueSlug(base: string, excludeId?: number): Promise<string> {
  const root = slugify(base);
  if (!(await slugTaken(root, excludeId))) return root;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${root}-${n}`;
    if (!(await slugTaken(candidate, excludeId))) return candidate;
  }
  return `${root}-${Date.now().toString(36)}`;
}

const route = makeRoute({
  permission: "admin",
  handlers: {
    GET: async () => {
      const categories = await prisma.electionCategory.findMany({
        include: CATEGORY_INCLUDE,
        orderBy: { name: "asc" },
      });
      return json(categories.map((category) => serializeCategory(category)));
    },
    POST: async (req, _params, state) => {
      const admin = requireStateAdmin(state);
      const payload = await readPayload(req);
      const c = new Collector();
      const name = strField(c, payload, "name", { maxLength: 120 });
      const slugRaw = strField(c, payload, "slug", { required: false, maxLength: 120 });
      const description = strField(c, payload, "description", {
        required: false,
        allowBlank: true,
        maxLength: 1000,
      });
      const icon = strField(c, payload, "icon", { required: false, allowBlank: true, maxLength: 60 });
      const isActive = boolField(c, payload, "is_active", { required: false, defaultValue: true });
      c.throwIfAny();

      const slug = slugRaw ? await uniqueSlug(slugRaw) : await uniqueSlug(name);

      let created;
      try {
        created = await prisma.electionCategory.create({
          data: {
            name,
            slug,
            description,
            icon,
            isActive: isActive ?? true,
            createdBy: admin.id,
          },
          include: CATEGORY_INCLUDE,
        });
      } catch (error) {
        if (isUniqueConstraintViolation(error)) {
          throw fieldErrors({ name: "A category with this name already exists." });
        }
        throw error;
      }
      return json(serializeCategory(created), 201);
    },
  },
});

export const GET = route;
export const POST = route;