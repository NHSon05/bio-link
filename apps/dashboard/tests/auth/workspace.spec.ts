import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import sample from "../../../landing/src/content/sites/fanpage-abc.json" with { type: "json" };
import { localAdmin, testSql } from "./local-supabase";

const slug = sample.slug;
const email = "workspace-" + randomUUID() + "@example.com";
const password = "P4ssword-" + randomUUID();
const landing = "http://127.0.0.1:55326";
const admin = localAdmin();
let userId = "";

test.beforeAll(async () => {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  userId = data.user.id;
  testSql(
    `with added as (
    insert into public.sites(slug, draft_config, published_config) values (:'slug', :'config'::jsonb, :'config'::jsonb)
    returning id) insert into public.site_members(user_id,site_id,role)
    select :'uid'::uuid, id, 'editor' from added;`,
    { slug, config: JSON.stringify(sample), uid: userId },
  );
});
test.afterAll(async () => {
  testSql("delete from public.sites where slug = :'slug';", { slug });
  if (userId) await admin.auth.admin.deleteUser(userId);
});

test.use({ reducedMotion: "reduce" });

test("Workspace tracks public traffic and carries bio, template and product edits through preview and publication", async ({
  page,
  context,
}, testInfo) => {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tổng quan" })).toBeVisible();
  const preview = page.frameLocator('iframe[title="Bản xem trước trang bio"]');
  await expect(preview.getByRole("heading", { name: sample.profile.title, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Máy tính", exact: true }).click();
  await expect(page.locator('[data-slot="browser-frame"]')).toBeVisible();
  await page.getByRole("button", { name: "Điện thoại", exact: true }).click();
  const visitor = await context.newPage();
  await context.route("https://**/*", (route) => route.abort());
  await visitor.goto(landing + "/" + slug + "/");
  const clickRecorded = visitor.waitForResponse(
    (response) => response.url().endsWith("/api/traffic") && response.request().postDataJSON().kind === "click",
  );
  // Liên kết vẫn phát sự kiện khi người dùng mở nó ở thẻ khác.
  await visitor.locator("[data-track]").first().click();
  expect((await clickRecorded).status()).toBe(204);
  await visitor.close();
  await page.reload();
  const metric = (name: string) =>
    page
      .locator('[data-slot="card"]')
      .filter({ has: page.getByText(name, { exact: true }) })
      .locator("strong");
  await expect(metric("Lượt xem")).toHaveText("1");
  await expect(metric("Lượt nhấp")).toHaveText("1");
  await expect(metric("Tỷ lệ nhấp")).toHaveText("100%");
  await expect(preview.getByRole("heading", { name: sample.profile.title, exact: true })).toBeVisible();
  await page.getByText("30 ngày", { exact: true }).click();
  await expect(page.getByRole("list", { name: "Lượt xem và lượt nhấp theo ngày" }).getByRole("listitem")).toHaveCount(
    30,
  );
  await page.getByText("7 ngày", { exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath("home-desktop.png"), fullPage: true, animations: "disabled" });
  await page.getByRole("button", { name: "Tìm kiếm" }).click();
  await page.getByRole("textbox", { name: "Từ khóa" }).fill("mang xa hoi");
  await page.getByRole("dialog").getByRole("link", { name: "Link in bio" }).click();
  await page.getByRole("textbox", { name: "Đường dẫn mạng xã hội" }).fill("https://instagram.com/workspace-demo");
  await page.getByRole("button", { name: "Thêm liên kết" }).click();
  await expect(preview.locator('a[href="https://instagram.com/workspace-demo"]')).toHaveCount(1);
  await page.getByRole("link", { name: "Slug", exact: true }).click();
  await page.getByRole("button", { name: /Video lên đầu/ }).click();
  await expect(preview.locator("#app")).toHaveAttribute("data-template", "video-first");
  await page.getByRole("link", { name: "Sản phẩm affiliate", exact: true }).click();
  await page.getByRole("button", { name: "Thêm sản phẩm", exact: true }).click();
  await page.getByLabel("Tên sản phẩm").fill("Sổ tay");
  await page.getByLabel("Liên kết sản phẩm", { exact: true }).fill("https://example.com/notebook");
  await page.getByLabel("Liên kết affiliate", { exact: true }).fill("https://example.com/notebook?ref=bio");
  await page.getByRole("button", { name: "Thêm vào bản nháp" }).click();
  await expect(preview.getByText("Sổ tay", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Lưu nháp", exact: true }).click();
  await expect(page.getByText("Đã lưu bản nháp.", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /Sổ tay/ }).click();
  await page.getByRole("button", { name: "Sửa sản phẩm", exact: true }).click();
  await page.getByLabel("Tên sản phẩm").fill("Sổ tay A5");
  await page.getByRole("button", { name: "Cập nhật bản nháp" }).click();
  await page.getByRole("button", { name: "Xuất bản", exact: true }).click();
  await expect(page.getByText(/Đã xuất bản\. Trang công khai/)).toBeVisible();
  // BUILD-3: chờ CDN, rồi "Đã lên CDN" khi job build báo xong (BUILD-2).
  await expect(page.getByText("Đang cập nhật CDN…", { exact: true })).toBeVisible();
  const { id } = await (await page.request.get(`/api/sites/${slug}/builds/latest`)).json();
  for (const status of ["running", "succeeded"]) {
    const report = await page.request.post(`/api/internal/builds/${id}`, {
      headers: { Authorization: "Bearer callback-test-only" },
      data: { status },
    });
    expect(report.status(), await report.text()).toBe(200);
  }
  await expect(page.getByText("Đã lên CDN", { exact: true })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("link", { name: "Website", exact: true }).click();
  await expect(
    page.frameLocator('iframe[title="Website đã xuất bản"]').getByText("Sổ tay A5", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Mở trang công khai" })).toHaveAttribute(
    "href",
    landing + "/" + slug + "/",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Mở hoặc thu gọn điều hướng" }).click();
  await page.getByRole("link", { name: "Sản phẩm affiliate", exact: true }).click();
  await page.getByRole("button", { name: /Sổ tay A5/ }).click();
  await page.getByRole("button", { name: "Xóa sản phẩm", exact: true }).click();
  await page.getByRole("button", { name: "Xác nhận xóa" }).click();
  await page.getByRole("button", { name: "Lưu nháp", exact: true }).click();
  await expect(page.getByText("Đã lưu bản nháp.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Sản phẩm affiliate" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Sổ tay A5/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Mở hoặc thu gọn điều hướng" }).click();
  await page.getByRole("link", { name: "Trang chủ", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tổng quan", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(metric("Tỷ lệ nhấp")).toHaveText("100%");
  await expect(preview.getByRole("heading", { name: sample.profile.title, exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("home-mobile.png"), animations: "disabled" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
