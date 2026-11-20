import "server-only";

export const EMAIL_CONFIRM_PATH = "/auth/confirm";
export const EMAIL_VERIFY_PATH = "/auth/confirm/verify";

export const EMAIL_CONFIRM_HEADERS = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "origin",
};

export function isEmailTokenHash(value: unknown): value is string {
  return typeof value === "string" && /^(?:pkce_)?[a-f0-9]{56}$/.test(value);
}
