import { expect, test } from "@playwright/test";

test.describe("SESSION-1 public authentication routes", () => {
  test("guests can open registration from login", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: "Đăng ký", exact: true }).click();

    await expect(page).toHaveURL("/register");
    await expect(page.getByRole("heading", { name: "Đăng ký" })).toBeVisible();
  });

  test("guests can open password recovery from login", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: "Quên mật khẩu?", exact: true }).click();

    await expect(page).toHaveURL("/forgot-password");
    await expect(page.getByRole("heading", { name: "Quên mật khẩu" })).toBeVisible();
  });

  test("guests can open the email confirmation entry point", async ({ page }) => {
    const path = `/auth/confirm?type=email&token_hash=${"a".repeat(56)}`;
    await page.goto(path);

    await expect(page).toHaveURL(path);
    await expect(page.getByRole("heading", { name: "Xác nhận email" })).toBeVisible();
  });

  test("the Google callback returns a signed-out guest to login with a retry message", async ({ page }) => {
    await page.goto("/auth/callback?error=access_denied");

    await expect(page).toHaveURL("/login?error=google");
    await expect(page.getByText("Không đăng nhập được với Google. Vui lòng thử lại.")).toBeVisible();
  });

  test("the dashboard, other auth paths, and the sites API still require authentication", async ({
    page,
    request,
    baseURL,
  }) => {
    await page.goto("/");
    await expect(page).toHaveURL("/login");

    const privatePath = await request.get("/auth/private", { maxRedirects: 0 });
    expect(privatePath.status()).toBe(307);
    const redirect = new URL(privatePath.headers().location, baseURL);
    expect(redirect.pathname).toBe("/login");
    expect(redirect.searchParams.get("next")).toBe("/auth/private");

    const sites = await request.get("/api/sites", { maxRedirects: 0 });
    expect(sites.status()).toBe(401);
  });
});
