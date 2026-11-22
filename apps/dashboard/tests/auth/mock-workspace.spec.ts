import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { localAdmin } from "./local-supabase";

test.skip(process.env.WORKSPACE_DATA_SOURCE !== "mock", "Chạy với WORKSPACE_DATA_SOURCE=mock.");
test.use({ reducedMotion: "reduce" });

test("A signed-in demo user can browse, save and publish samples independently of live sites", async ({
  page,
  context,
}, testInfo) => {
  const admin = localAdmin();
  const password = "Demo-" + randomUUID();
  const ids: string[] = [];
  const liveRequests: string[] = [];
  context.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/api/sites")) liveRequests.push(r.url());
  });
  async function signIn(target: Page) {
    const email = "mock-" + randomUUID() + "@example.com";
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    ids.push(data.user.id);
    await target.goto("/login");
    await target.getByLabel("Email", { exact: true }).fill(email);
    await target.getByLabel("Mật khẩu", { exact: true }).fill(password);
    await target.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await expect(target.getByText("Dữ liệu mẫu", { exact: true })).toBeVisible();
  }
  try {
    await signIn(page);
    await expect(page.getByRole("heading", { name: "Các slug (4)" })).toBeVisible();
    const frame = page.frameLocator('iframe[title="Bản xem trước trang bio"]');
    await expect(frame.getByRole("heading", { name: "ABC Shop", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Máy tính", exact: true }).click();
    await expect(page.locator('[data-slot="browser-frame"]')).toHaveCount(4);
    await page.getByRole("button", { name: "Điện thoại", exact: true }).click();
    await expect(page.locator('[data-slot="phone-frame"]')).toHaveCount(4);
    await expect(frame.getByRole("heading", { name: "ABC Shop", exact: true })).toBeVisible();
    await expect(
      page.frameLocator('iframe[title="Xem trước /beat-artist"]').getByRole("heading", { name: "lumen", exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("demo-home.png"), animations: "disabled" });
    await page.getByRole("link", { name: "Sản phẩm affiliate", exact: true }).click();
    await page.getByRole("button", { name: /^Công nghệ ·/ }).click();
    await expect(page.getByRole("button", { name: /Tai nghe Bluetooth/ })).toHaveCount(1);
    await page.getByRole("textbox", { name: "Đường dẫn sản phẩm" }).fill("https://example.com/demo-notebook");
    await page.getByRole("button", { name: "Thêm sản phẩm", exact: true }).click();
    await expect(page.getByLabel("Liên kết sản phẩm", { exact: true })).toHaveValue(
      "https://example.com/demo-notebook",
    );
    await page.getByLabel("Tên sản phẩm").fill("Sổ demo");
    await page.getByRole("button", { name: "Thêm vào bản nháp" }).click();
    await expect(page.getByRole("button", { name: /Sổ demo/ })).toBeVisible();
    await page.getByRole("button", { name: "Lưu nháp", exact: true }).click();
    await expect(page.getByText("Đã lưu bản nháp.", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: /Sổ demo/ })).toBeVisible();
    await expect(frame.getByRole("heading", { name: "ABC Shop", exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("demo-products.png"), animations: "disabled" });
    await page.getByRole("link", { name: "Link in bio", exact: true }).click();
    await page.getByLabel("Tên", { exact: true }).fill("Trang mẫu riêng");
    await page.getByRole("button", { name: "Lưu nháp", exact: true }).click();
    await expect(page.getByText("Đã lưu bản nháp.", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Website", exact: true }).click();
    const published = page.frameLocator('iframe[title="Website đã xuất bản"]');
    await expect(published.getByRole("heading", { name: "ABC Shop", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Link in bio", exact: true }).click();
    await page.getByRole("button", { name: "Xuất bản", exact: true }).click();
    await expect(page.getByText("Đã xuất bản trang mẫu trong trình duyệt này.")).toBeVisible();
    await page.getByRole("link", { name: "Website", exact: true }).click();
    const opened = context.waitForEvent("page");
    await page.getByRole("link", { name: "Mở trang mẫu" }).click();
    const tab = await opened;
    await expect(
      tab.frameLocator("iframe").getByRole("heading", { name: "Trang mẫu riêng", exact: true }),
    ).toBeVisible();
    await tab.close();
    await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
    await signIn(page);
    await expect(frame.getByRole("heading", { name: "ABC Shop", exact: true })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() =>
        page.evaluate(() =>
          document.documentElement.scrollWidth <= innerWidth
            ? []
            : Array.from(document.querySelectorAll("body *"))
                .filter((el) => el.getBoundingClientRect().right > innerWidth + 1)
                .slice(0, 12)
                .map((el) => ({ tag: el.tagName, cls: el.className, right: el.getBoundingClientRect().right })),
        ),
      )
      .toEqual([]);
    await page.screenshot({ path: testInfo.outputPath("demo-mobile.png"), animations: "disabled" });
    expect(liveRequests).toEqual([]);
  } finally {
    for (const id of ids) await admin.auth.admin.deleteUser(id);
  }
});
