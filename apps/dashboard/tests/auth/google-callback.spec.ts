import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { googleButton, googleCallback, startGoogle } from "./google";
import { localAdmin } from "./local-supabase";

const supabase = localAdmin();
let userId: string;

test.beforeAll(async () => {
  const { data, error } = await supabase.auth.admin.createUser({
    email: `google-${randomUUID()}@example.com`,
    email_confirm: true,
  });
  if (error) throw error;
  userId = data.user.id;
});

test.afterAll(async () => {
  if (userId) {
    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) throw error;
  }
});

async function hasSessionCookie(page: Page) {
  return (await page.context().cookies()).some(({ name }) => /^sb-.*-auth-token(?:\.\d+)?$/.test(name));
}

async function expectRetry(page: Page, destination = "/login?error=google") {
  await expect(page).toHaveURL(destination);
  await expect(page.getByText("Không đăng nhập được với Google. Vui lòng thử lại.")).toBeVisible();
  await expect(page.getByRole("button", { name: googleButton })).toBeEnabled();
  expect(await hasSessionCookie(page)).toBe(false);
  expect((await page.request.get("/api/sites")).status()).toBe(401);
}

test("GOOGLE-1 exchanges the code with the original verifier and creates a dashboard session", async ({ page }) => {
  await page.goto("/login?next=%2F%3Ffrom%3Dgoogle%23editor");
  const callback = googleCallback(await startGoogle(page), userId);
  // Giữ mã theo lượt đăng nhập, xóa bản sao dùng chung của SDK.
  await page.context().clearCookies({ name: /^sb-.*-auth-token-code-verifier$/ });
  const reply = await page.request.get(callback.href, { maxRedirects: 0 });
  expect(reply.headers().location).toBe(new URL("/?from=google#editor", callback).href);
  expect(reply.headers()["cache-control"]).toContain("private");
  expect(reply.headers()["cache-control"]).toContain("no-store");
  expect(await hasSessionCookie(page)).toBe(true);

  await page.goto(reply.headers().location);
  await expect(page.getByRole("button", { name: "Đăng xuất" })).toBeVisible();
  expect((await page.request.get("/api/sites")).status()).toBe(200);
});

test("GOOGLE-2 ignores an external return path posted from the Google form", async ({ page }) => {
  await page.goto("/login?next=https%3A%2F%2Fexample.invalid");
  const next = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: googleButton }) })
    .locator('input[name="next"]');
  await expect(next).toHaveValue("/");
  await next.evaluate((input: HTMLInputElement) => {
    input.value = "//example.invalid/";
  });
  await page.goto(googleCallback(await startGoogle(page), userId).href);
  await expect(page).toHaveURL("/");
  expect((await page.request.get("/api/sites")).status()).toBe(200);
});

for (const [caseName, query] of [
  ["cancellation", "?error=access_denied"],
  ["missing code", ""],
  ["invalid code", `?code=${randomUUID()}`],
]) {
  test(`GOOGLE-2 ${caseName} returns to login without a session`, async ({ page }) => {
    await page.goto("/login?next=%2F%3Ffrom%3Dretry");
    await startGoogle(page);
    await page.goto(`/auth/callback${query}`);
    await expectRetry(page, "/login?error=google&next=%2F%3Ffrom%3Dretry");
  });
}

test("GOOGLE-2 refuses duplicate code parameters even when the first code is valid", async ({ page }) => {
  await page.goto("/login");
  const callback = googleCallback(await startGoogle(page), userId);
  callback.searchParams.append("code", randomUUID());
  await page.goto(callback.href);
  await expectRetry(page);
});

test("GOOGLE-2 rejects a replay even with the original verifier cookies", async ({ page, browser, baseURL }) => {
  await page.goto("/login");
  const callback = googleCallback(await startGoogle(page), userId);
  const state = await page.context().storageState();
  await page.goto(callback.href);
  await expect(page).toHaveURL("/");
  expect((await page.request.get("/api/sites")).status()).toBe(200);

  const replay = await browser.newContext({ baseURL, storageState: state });
  try {
    const otherPage = await replay.newPage();
    await otherPage.goto(callback.href);
    await expectRetry(otherPage);
  } finally {
    await replay.close();
  }
});

test("GOOGLE-2 rejects a valid code when its verifier is missing", async ({ page }) => {
  await page.goto("/login");
  const callback = googleCallback(await startGoogle(page), userId);
  await page.context().clearCookies({ name: /code-verifier/ });
  await page.goto(callback.href);
  await expectRetry(page);
});
