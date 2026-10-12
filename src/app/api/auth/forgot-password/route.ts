import { makeRoute } from "@/src/lib/api";
import { serviceUnavailable } from "@/src/lib/http";

/**
 * Password reset requires an out-of-band channel (email or SMS) to prove the
 * requester owns the account. This deployment has no mail service configured,
 * so the endpoint refuses rather than letting anyone who knows a username
 * overwrite a password. The admin console can reset credentials for a user
 * it already verified.
 */
export const POST = makeRoute({
  handlers: {
    POST: async () => {
      throw serviceUnavailable(
        "Password self-service reset is not available on this deployment. Contact your administrator.",
      );
    },
  },
});
