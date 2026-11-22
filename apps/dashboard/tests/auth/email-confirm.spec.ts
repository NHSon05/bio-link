import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { latestMailLink } from "./mailpit";

const supabase = createClient(process.env.AUTH_TEST_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const emailAuth = createClient(process.env.AUTH_TEST_SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
  auth: { flowType: "pkce", autoRefreshToken: false, persistSession: false },
});
const emailPrefix = `confirm-${randomUUID()}-`;
const password = `P4ssword-${randomUUID()}`;
const confirmPath = "/auth/confirm";
const resendPath = "/register/resend";
const continueLabel = "Xác nhận email";
const resendLabel = "Gửi lại email xác nhận";
const invalidMessage = "Liên kết xác nhận không hợp lệ hoặc đã hết hạn.";
const resendMessage = "Nếu địa chỉ này cần xác nhận, bạn sẽ nhận được email xác nhận.";
const unknownToken = `pkce_${"a".repeat(56)}`;

test.afterAll(async () => {
  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) throw error;
  for (const user of data.users.filter(({ email }) => email?.startsWith(emailPrefix))) {
    const { error } = await supabase.auth.admin.deleteUser(user.id);
    if (error) throw error;
  }
});

function tokenPath(token: string, type = "email") {
  return `${confirmPath}?${new URLSearchParams({ type, token_hash: token })}`;
}

async function expectInvalidLink(page: Page) {
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(invalidMessage);
  await expect(page.getByRole("link", { name: resendLabel })).toHaveAttribute("href", resendPath);
  expect((await page.request.get("/api/sites")).status()).toBe(401);
}

async function submitConfirmation(page: Page) {
  await page.getByRole("button", { name: continueLabel, exact: true }).click({ timeout: 5_000 });
}

test("EMAIL-1 EMAIL-2 LOGIN-1 a preview leaves the real signup link usable once", async ({
  page,
  request,
  browser,
  baseURL,
}) => {
  const email = `${emailPrefix}preview@example.com`;
  await page.goto("/register");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByLabel("Xác nhận mật khẩu", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Đăng ký", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Kiểm tra email" })).toBeVisible();

  const link = await latestMailLink(request, email);
  expect(link.pathname).toBe(confirmPath);
  expect(link.origin).toBe(baseURL);
  const preview = await request.get(link.href, { maxRedirects: 0 });
  expect(preview.status()).toBe(200);
  expect(preview.headers()["cache-control"]).toContain("no-store");
  expect(preview.headers()["referrer-policy"]).toBe("origin");
  expect(preview.headers()["set-cookie"]).toBeUndefined();
  const crossOrigin = await request.post(`${confirmPath}/verify`, {
    headers: { origin: "https://example.invalid" },
    form: { token_hash: link.searchParams.get("token_hash")! },
    maxRedirects: 0,
  });
  expect(crossOrigin.status()).toBe(403);

  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page.getByText("Xác nhận email trước khi đăng nhập.", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: resendLabel })).toHaveAttribute("href", resendPath);
  expect((await page.request.get("/api/sites")).status()).toBe(401);

  const confirmation = await browser.newPage();
  try {
    await confirmation.goto(link.href);
    const response = confirmation.waitForResponse(
      (response) =>
        response.request().method() === "POST" && new URL(response.url()).pathname === `${confirmPath}/verify`,
    );
    await submitConfirmation(confirmation);
    const verification = await response;
    expect(verification.status()).toBe(303);
    const cacheControl = verification.headers()["cache-control"];
    expect(cacheControl).toContain("private");
    expect(cacheControl).toContain("no-store");
    await expect(confirmation).toHaveURL(`${baseURL}/`);
    await expect(confirmation.getByRole("button", { name: "Đăng xuất" })).toBeVisible();
    expect((await confirmation.request.get(`${baseURL}/api/sites`)).status()).toBe(200);
  } finally {
    await confirmation.close();
  }

  await page.goto(link.href);
  await submitConfirmation(page);
  await expect(page).toHaveURL(confirmPath);
  await expectInvalidLink(page);
});

test("EMAIL-2 rejects malformed parameters and unknown confirmation tokens", async ({ page }) => {
  for (const path of [confirmPath, tokenPath("bad hash"), tokenPath(unknownToken, "recovery")]) {
    await page.goto(path);
    await expectInvalidLink(page);
    await expect(page.getByRole("button", { name: continueLabel, exact: true })).toHaveCount(0);
  }

  await page.goto(tokenPath(unknownToken));
  await submitConfirmation(page);
  await expect(page).toHaveURL(confirmPath);
  await expectInvalidLink(page);
});

test("EMAIL-2 rejects an actual recovery token presented as a signup token", async ({ page, request }) => {
  const email = `${emailPrefix}recovery@example.com`;
  const { error: createError } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  if (createError) throw createError;
  const { error } = await emailAuth.auth.resetPasswordForEmail(email);
  if (error) throw error;
  const link = await latestMailLink(request, email);
  const recoveryToken = link.searchParams.get("token");
  expect(recoveryToken?.startsWith("pkce_")).toBe(true);

  await page.goto(tokenPath(recoveryToken!));
  await submitConfirmation(page);

  await expect(page).toHaveURL(confirmPath);
  await expectInvalidLink(page);
});

test("EMAIL-2 rejects a Supabase invite hash even if it is presented as a PKCE signup token", async ({ page }) => {
  const email = `${emailPrefix}invite@example.com`;
  const { data, error } = await supabase.auth.admin.generateLink({ type: "invite", email });
  if (error) throw error;
  const token = data.properties.hashed_token;

  await page.goto(tokenPath(token));
  await expectInvalidLink(page);
  await page.goto(tokenPath(`pkce_${token}`));
  await submitConfirmation(page);

  await expect(page).toHaveURL(confirmPath);
  await expectInvalidLink(page);
});

test("EMAIL-2 rejects an expired signup hash and SIGNUP-1 can resend a usable link", async ({
  page,
  request,
  baseURL,
}) => {
  const email = `${emailPrefix}expired@example.com`;
  const { data, error } = await emailAuth.auth.signUp({ email, password });
  if (error || !data.user) throw error ?? new Error("Không tạo được tài khoản kiểm thử.");
  const expiredLink = await latestMailLink(request, email);
  expect(expiredLink.origin).toBe(baseURL);
  const db = `supabase_db_${process.env.AUTH_TEST_PROJECT_ID}`;
  const aged = spawnSync(
    "docker",
    ["exec", "-i", db, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-v", `user_id=${data.user.id}`],
    {
      input: "update auth.users set confirmation_sent_at = now() - interval '2 days' where id = :'user_id'::uuid;",
      encoding: "utf8",
    },
  );
  if (aged.error) throw aged.error;
  expect(aged.status, aged.stderr).toBe(0);
  expect(aged.stdout).toContain("UPDATE 1");

  await page.goto(expiredLink.href);
  await submitConfirmation(page);
  await expect(page).toHaveURL(confirmPath);
  await expectInvalidLink(page);

  await page.getByRole("link", { name: resendLabel }).click();
  await expect(page).toHaveURL(resendPath);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("button", { name: resendLabel, exact: true }).click();
  await expect(page.getByText(resendMessage, { exact: true })).toBeVisible();
  const link = await latestMailLink(request, email);
  expect(link.pathname).toBe(confirmPath);
  expect(link.origin).toBe(baseURL);
  expect(link.searchParams.get("token_hash") === expiredLink.searchParams.get("token_hash")).toBe(false);
  await page.goto(link.href);
  await submitConfirmation(page);
  await expect(page).toHaveURL("/");
});

test("SIGNUP-1 resend shows the same response for pending, confirmed, and unknown addresses", async ({ page }) => {
  const pendingEmail = `${emailPrefix}pending@example.com`;
  const confirmedEmail = `${emailPrefix}confirmed@example.com`;
  for (const [email, email_confirm] of [
    [pendingEmail, false],
    [confirmedEmail, true],
  ] as const) {
    const { error } = await supabase.auth.admin.createUser({ email, password, email_confirm });
    if (error) throw error;
  }

  for (const email of [pendingEmail, pendingEmail, confirmedEmail, `${emailPrefix}unknown@example.com`]) {
    await page.goto(resendPath);
    await expect(page).toHaveURL(resendPath);
    await page.getByLabel("Email", { exact: true }).fill(email);
    const response = page.waitForResponse(
      (response) => response.request().method() === "POST" && new URL(response.url()).pathname === resendPath,
    );
    await page.getByRole("button", { name: resendLabel, exact: true }).click();
    await expect(page.getByRole("heading", { name: "Kiểm tra email" })).toBeVisible();
    await expect(page.getByText(resendMessage, { exact: true })).toBeVisible();
    expect(await (await response).headerValues("set-cookie")).toEqual([]);
  }
  expect((await page.request.get("/api/sites")).status()).toBe(401);
});
