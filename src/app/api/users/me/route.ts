import { json, makeRoute } from "@/src/lib/api";
import { fieldErrors } from "@/src/lib/http";
import { Collector, strField, isValidPhone } from "@/src/lib/fields";
import { prisma } from "@/src/lib/db";
import { readPayload } from "@/src/lib/request";
import { requireStateUser } from "@/src/lib/auth";
import { serializeUserSummary } from "@/src/lib/serializers";
import { USER_INCLUDE } from "@/src/lib/auth";

/**
 * PATCH: the signed-in user updates their own WhatsApp phone number, which
 * election officers use as the sending identity when sharing election links.
 * An empty/blank value clears the number.
 */
export const PATCH = makeRoute({
  permission: "authenticated",
  handlers: {
    PATCH: async (req, _params, state) => {
      const user = requireStateUser(state);
      const payload = await readPayload(req);
      const c = new Collector();
      const phoneNumber = strField(c, payload, "phone_number", {
        required: false,
        allowBlank: true,
        maxLength: 25,
      });
      c.throwIfAny();

      const trimmed = (phoneNumber ?? "").trim();
      if (trimmed && !isValidPhone(trimmed)) {
        throw fieldErrors({
          phone_number: "Enter a valid phone number (digits, optionally starting with +).",
        });
      }

      const updated = await prisma.user.update({
        where: { id: user.id },
        data: { phoneNumber: trimmed },
        include: USER_INCLUDE,
      });
      return json(serializeUserSummary(updated));
    },
  },
});
