import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { createClient, type User } from "@supabase/supabase-js";

const supabase = createClient(process.env.AUTH_TEST_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const testId = randomUUID();
const confirmedEmail = `confirmed-${testId}@example.com`;
const unconfirmedEmail = `pending-${testId}@example.com`;
const password = `P4ssword-${randomUUID()}`;
const users: User[] = [];

test.beforeAll(async () => {
  for (const [email, emailConfirmed] of [
    [confirmedEmail, true],
    [unconfirmedEmail, false],
  ] as const) {
    const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: emailConfirmed });
    if (error) throw error;
    users.push(data.user);
  }
});

test.afterAll(async () => {
  const results = await Promise.all(users.map(({ id }) => supabase.auth.admin.deleteUser(id)));
  for (const { error } of results) {
    if (error) throw error;
  }
});

async function signIn(page: Page, email = confirmedEmail, submittedPassword = password) {
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(submittedPassword);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
}

async function sessionCookie(page: Page) {
  const cookies = await page.context().cookies();
  return cookies
    .filter(({ name }) => /^sb-.*-auth-token(?:\.\d+)?$/.test(name))
    .map(({ name, value }) => `${name}=${value}`)
    .sort()
    .join(";");
}

test("LOGIN-1 shows an error for incorrect credentials", async ({ page }) => {
  await page.goto("/login");
  await signIn(page, confirmedEmail, "incorrect-password");

  await expect(page.getByText("Không đăng nhập được. Kiểm tra email và mật khẩu.")).toBeVisible();
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue(confirmedEmail);
  await expect(page.getByRole("button", { name: "Đăng nhập với Google", exact: true })).toBeVisible();
  expect((await page.request.get("/api/sites")).status()).toBe(401);
});

test("LOGIN-1 tells an unverified user to confirm their email", async ({ page }) => {
  await page.goto("/login");
  await signIn(page, unconfirmedEmail);

  await expect(page.getByText("Xác nhận email trước khi đăng nhập.", { exact: true })).toBeVisible();
  expect((await page.request.get("/api/sites")).status()).toBe(401);
});

test("LOGIN-1 returns to a valid local destination", async ({ page }) => {
  const destination = "/?from=login#dashboard";
  await page.goto(`/login?next=${encodeURIComponent(destination)}`);
  await signIn(page);

  await expect(page).toHaveURL(destination);
  await expect(page.getByRole("button", { name: "Đăng xuất" })).toBeVisible();
});

test("LOGIN-1 ignores an external return destination in the submitted form", async ({ page }) => {
  await page.goto(`/login?next=${encodeURIComponent("https://example.invalid/")}`);
  const next = page.locator('input[name="next"]').first();
  await expect(next).toHaveValue("/");
  await next.evaluate((input: HTMLInputElement) => {
    input.value = "//example.invalid/";
  });

  await signIn(page);
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("button", { name: "Đăng xuất" })).toBeVisible();
});

test("SESSION-1 refreshes the Supabase cookie and keeps the user signed in on reload", async ({ page }) => {
  await page.goto("/login");
  await signIn(page);
  await expect(page.getByRole("button", { name: "Đăng xuất" })).toBeVisible();
  const previousCookie = await sessionCookie(page);
  expect(Boolean(previousCookie)).toBe(true);

  // The isolated stack issues short-lived access tokens, so the server refreshes on reload.
  const reloaded = await page.reload();
  await expect(page.getByRole("button", { name: "Đăng xuất" })).toBeVisible();
  const refreshedCookie = await sessionCookie(page);
  expect(Boolean(refreshedCookie)).toBe(true);
  expect(refreshedCookie !== previousCookie).toBe(true);
  expect(await reloaded?.headerValue("cache-control")).toContain("no-store");
  expect((await page.request.get("/api/sites")).status()).toBe(200);
});

test("LOGIN-2 and SESSION-1 sign-out blocks the next protected page and API request", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL("/login");
  await signIn(page);
  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await expect(page).toHaveURL("/login");

  expect(await sessionCookie(page)).toBe("");
  await page.goto("/");
  await expect(page).toHaveURL("/login");
  expect((await page.request.get("/api/sites")).status()).toBe(401);
});
