import { json, makeRoute } from "@/src/lib/api";
import { prisma } from "@/src/lib/db";
import { formatDateTime } from "@/src/lib/time";
import { CONTACT_STATUSES, serializeContact } from "@/src/app/api/contact/route";

export const CONTACT_SENDER_SELECT = {
  id: true,
  username: true,
  role: true,
  firstName: true,
  lastName: true,
  isActive: true,
} as const;

export const CONTACT_INCLUDE = { user: { select: CONTACT_SENDER_SELECT } } as const;

/**
 * Inbox view of a contact message: the public fields plus the account that
 * sent it (voters and officers are linked when signed in; public messages
 * have no sender) and the administrator's reply.
 */
export function serializeAdminContact(message: {
  id: number;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: string;
  reply: string | null;
  repliedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  user: {
    id: number;
    username: string;
    role: string;
    firstName: string;
    lastName: string;
    isActive: boolean;
  } | null;
}) {
  const fullName = `${message.user?.firstName ?? ""} ${message.user?.lastName ?? ""}`.trim();
  return {
    ...serializeContact(message),
    sender: message.user
      ? {
          id: message.user.id,
          username: message.user.username,
          role: message.user.role,
          full_name: fullName || message.user.username,
        }
      : null,
    reply: message.reply,
    replied_at: formatDateTime(message.repliedAt),
  };
}

export const GET = makeRoute({
  permission: "admin",
  handlers: {
    GET: async (req) => {
      const url = new URL(req.url);
      const statusParam = url.searchParams.get("status") ?? undefined;
      const status =
        statusParam && CONTACT_STATUSES.includes(statusParam as never)
          ? statusParam
          : undefined;
      const messages = await prisma.contactMessage.findMany({
        where: status ? { status } : undefined,
        include: CONTACT_INCLUDE,
        orderBy: { createdAt: "desc" },
        take: 500,
      });
      return json(messages.map(serializeAdminContact));
    },
  },
});
