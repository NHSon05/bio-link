import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { latestMailLink } from "./mailpit";

const supabase = createClient(process.env.AUTH_TEST_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const emailPrefix = `signup-${randomUUID()}-`;
const password = `P4ssword-${randomUUID()}`;
const checkEmailMessage = "Nếu có thể đăng ký với địa chỉ này, bạn sẽ nhận được email xác nhận.";

test.afterAll(async () => {
  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) throw error;
  for (const user of data.users.filter(({ email }) => email?.startsWith(emailPrefix))) {
    const { error } = await supabase.auth.admin.deleteUser(user.id);
    if (error) throw error;
  }
});

function signupRequestCount() {
  const container = `supabase_auth_${process.env.AUTH_TEST_PROJECT_ID}`;
  const logs = spawnSync("docker", ["logs", container], { encoding: "utf8" });
  if (logs.error) throw logs.error;
  if (logs.status !== 0) throw new Error(`Không đọc được nhật ký Auth của ${container}.`);
  return `${logs.stdout}\n${logs.stderr}`
    .split("\n")
    .filter((line) => line.includes('"method":"POST"') && line.includes('"path":"/signup"')).length;
}

async function submitRegistration(page: Page, email: string, submittedPassword: string, confirmation: string) {
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(submittedPassword);
  await page.getByLabel("Xác nhận mật khẩu", { exact: true }).fill(confirmation);
  await page.getByRole("button", { name: "Đăng ký", exact: true }).click();
}

async function expectCheckEmailState(page: Page) {
  await expect(page.getByRole("heading", { name: "Kiểm tra email" })).toBeFocused();
  await expect(page.getByText(checkEmailMessage)).toBeVisible();
  expect((await page.request.get("/api/sites")).status()).toBe(401);
}

for (const [name, email, submittedPassword, confirmation, error] of [
  ["invalid email", "invalid-email", password, password, "Nhập địa chỉ email hợp lệ."],
  ["malformed email domain", "user@example-.com", password, password, "Nhập địa chỉ email hợp lệ."],
  [
    "mismatched passwords",
    `${emailPrefix}mismatch@example.com`,
    password,
    "different",
    "Mật khẩu xác nhận không khớp.",
  ],
  ["short password", `${emailPrefix}short@example.com`, "short", "short", "Mật khẩu phải có ít nhất 8 ký tự."],
]) {
  test(`SIGNUP-1 rejects ${name} before calling Supabase`, async ({ page }) => {
    await page.goto("/register");
    const before = signupRequestCount();
    // Bỏ qua kiểm tra của trình duyệt để kiểm tra Server Action.
    await page.locator("form").evaluate((form: HTMLFormElement) => {
      form.noValidate = true;
    });

    await submitRegistration(page, email, submittedPassword, confirmation);

    await expect(page.getByRole("main").getByRole("alert")).toHaveText(error);
    expect(signupRequestCount()).toBe(before);
  });
}

test("SIGNUP-1 shows the check-your-email state and delivers a confirmation to Mailpit", async ({ page, request }) => {
  const email = `${emailPrefix}new!user@example.com`;
  await page.goto("/register");
  const before = signupRequestCount();

  await submitRegistration(page, email, password, password);

  await expectCheckEmailState(page);
  expect(signupRequestCount()).toBeGreaterThan(before);
  const link = await latestMailLink(request, email);
  expect(link.pathname).toBe("/auth/confirm");
  expect(link.searchParams.get("type")).toBe("email");

  await page.goto("/register");
  await submitRegistration(page, email, password, password);
  await expectCheckEmailState(page);
});

test("SIGNUP-1 shows the same check-your-email state for a duplicate address", async ({ page }) => {
  const email = `${emailPrefix}duplicate@example.com`;
  const { error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  await page.goto("/register");

  await submitRegistration(page, email, `Other-${password}`, `Other-${password}`);

  await expectCheckEmailState(page);
});
