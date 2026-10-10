import { OAuth2Client } from "google-auth-library";

export type GooglePayload = {
  sub?: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  [key: string]: unknown;
};

/** Token missing or not verifiable (HTTP 400 - could not be verified). */
export class GoogleVerificationError extends Error {}

/** Upstream call failed (HTTP 503 - temporarily unavailable). */
export class GoogleNetworkError extends Error {}

async function verifyIdToken(idToken: string, clientId: string): Promise<GooglePayload> {
  const client = new OAuth2Client(clientId);
  const ticket = await client.verifyIdToken({ idToken, audience: clientId });
  const payload = ticket.getPayload();
  if (!payload) {
    throw new GoogleVerificationError("Google sign-in could not be verified.");
  }
  return payload as unknown as GooglePayload;
}

async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string | undefined,
): Promise<string> {
  let response: Response;
  try {
    response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret ?? "",
        redirect_uri: "postmessage",
        grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new GoogleNetworkError("Google sign-in is temporarily unavailable. Please try again.");
  }

  if (!response.ok) {
    throw new GoogleVerificationError("Google sign-in could not be verified.");
  }

  const tokenResponse = (await response.json().catch(() => ({}))) as { id_token?: string };
  const idToken = tokenResponse.id_token;
  if (!idToken) {
    throw new GoogleVerificationError("Google sign-in could not be verified.");
  }
  return idToken;
}

export async function verifyGoogleIdentity(options: {
  credential?: string;
  code?: string;
  clientId: string;
  clientSecret?: string;
}): Promise<GooglePayload> {
  const { credential, code, clientId, clientSecret } = options;

  if (credential) {
    try {
      return await verifyIdToken(credential, clientId);
    } catch (error) {
      if (error instanceof GoogleVerificationError) throw error;
      throw new GoogleVerificationError("Google sign-in could not be verified.");
    }
  }

  if (code) {
    const idToken = await exchangeCode(code, clientId, clientSecret);
    try {
      return await verifyIdToken(idToken, clientId);
    } catch (error) {
      if (error instanceof GoogleVerificationError) throw error;
      throw new GoogleVerificationError("Google sign-in could not be verified.");
    }
  }

  throw new GoogleVerificationError("Google sign-in could not be verified.");
}
