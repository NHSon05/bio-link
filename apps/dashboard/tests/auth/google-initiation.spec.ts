import { expect, test } from "@playwright/test";
import { googleButton, googleUrl, startGoogle } from "./google";

test("GOOGLE-1 sends the S256 challenge and exact configured callback to Supabase", async ({ page, baseURL }) => {
  await page.goto("/login?next=%2F%3Ffrom%3Dgoogle");
  const authorize = await startGoogle(page);
  expect(authorize.get("provider")).toBe("google");
  expect(authorize.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(authorize.get("code_challenge_method")).toBe("s256");
  expect(authorize.get("redirect_to")).toBe(`${baseURL}/auth/callback`);
});

test("GOOGLE-2 returns to a retryable login when the provider is unavailable", async ({ page, request }) => {
  const availability = `${googleUrl}/google/availability`;
  expect((await request.post(`${availability}?enabled=false`)).status()).toBe(204);
  try {
    await page.goto("/login?next=%2F%3Ffrom%3Dretry");
    await page.getByRole("button", { name: googleButton }).click();
    await expect(page).toHaveURL("/login?error=google&next=%2F%3Ffrom%3Dretry");
    await expect(page.getByText("Không đăng nhập được với Google. Vui lòng thử lại.")).toBeVisible();
    expect((await page.request.get("/api/sites")).status()).toBe(401);
  } finally {
    expect((await request.post(`${availability}?enabled=true`)).status()).toBe(204);
  }
  await startGoogle(page);
});
