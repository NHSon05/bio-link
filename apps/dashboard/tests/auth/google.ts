import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { testSql } from "./local-supabase";

export const googleUrl = process.env.AUTH_TEST_GOOGLE_URL!;
export const googleButton = "Đăng nhập với Google";

export async function startGoogle(page: Page) {
  await page.getByRole("button", { name: googleButton, exact: true }).click();
  await expect(page).toHaveURL((url) => url.origin === googleUrl && url.pathname === "/google/consent");
  return new URL(page.url()).searchParams;
}

export function googleCallback(authorize: URLSearchParams, userId: string) {
  const callback = new URL(authorize.get("redirect_to")!);
  const code = randomUUID();
  // Mô phỏng bước Google đồng ý. Supabase thật kiểm tra PKCE và cấp phiên.
  testSql(
    `insert into auth.flow_state
      (id, user_id, auth_code, auth_code_issued_at, code_challenge_method, code_challenge,
       provider_type, authentication_method, provider_access_token, provider_refresh_token, created_at, updated_at)
    values (gen_random_uuid(), :'user_id'::uuid, :'code', now(), 's256', :'challenge', 'google', 'oauth', 'simulated', '', now(), now());`,
    { user_id: userId, code, challenge: authorize.get("code_challenge")! },
  );
  callback.searchParams.set("code", code);
  return callback;
}
