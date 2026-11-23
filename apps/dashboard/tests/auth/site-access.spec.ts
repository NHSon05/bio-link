import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { SiteSchema, type Site } from "@bio-link/schema";
import { googleCallback, startGoogle } from "./google";
import { localAdmin, localAuth, testSql } from "./local-supabase";
import { latestMailLink } from "./mailpit";

const admin = localAdmin();
const suffix = randomUUID();
const password = `P4ssword-${randomUUID()}`;
const assigned = SiteSchema.parse({ slug: `alpha-${suffix}`, profile: { title: "Trang Alpha" } });
const other = SiteSchema.parse({ slug: `beta-${suffix}`, profile: { title: "Trang Beta" } });
const created = `gamma-${suffix}`;
const renamed = `delta-${suffix}`;
const firstSite = `first-${suffix}`;
const users = new Map<string, { id: string; email: string }>();
const path = (site: Site) => `/api/sites/${site.slug}`;
const history = (site: Site) => `${path(site)}/versions`;

async function createUser(name: string, withPassword = true) {
  const email = `${name}-${suffix}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password: withPassword ? password : undefined,
  });
  if (error) throw error;
  const user = { id: data.user.id, email };
  users.set(name, user);
  return user;
}

test.beforeAll(async () => {
  const [viewer, editor, owner] = await Promise.all([createUser("viewer"), createUser("editor"), createUser("admin")]);
  testSql(
    `begin;
     with fixtures as (
       insert into public.sites (slug, draft_config, published_config)
       values (:'assigned', :'assigned_config'::jsonb, :'assigned_config'::jsonb),
              (:'other', :'other_config'::jsonb, :'other_config'::jsonb)
       returning id, published_config
     )
     insert into public.site_versions (site_id, config, note)
     select id, published_config, 'Bản đầu tiên' from fixtures;
     insert into public.site_members (user_id, site_id, role)
     select assignment.user_id, site.id, assignment.role
     from public.sites as site
     cross join (values (:'viewer'::uuid, 'viewer'), (:'editor'::uuid, 'editor')) as assignment(user_id, role)
     where site.slug = :'assigned';
     insert into public.site_admins (user_id) values (:'admin'::uuid);
     commit;`,
    {
      assigned: assigned.slug,
      assigned_config: JSON.stringify(assigned),
      other: other.slug,
      other_config: JSON.stringify(other),
      viewer: viewer.id,
      editor: editor.id,
      admin: owner.id,
    },
  );
});

test.afterAll(async () => {
  testSql("delete from public.sites where slug in (:'assigned', :'other', :'created', :'renamed', :'first');", {
    assigned: assigned.slug,
    other: other.slug,
    created,
    renamed,
    first: firstSite,
  });
  const { data, error } = await admin.auth.admin.listUsers();
  if (error) throw error;
  const fixtureUsers = data.users.filter(({ email }) => email?.endsWith(`-${suffix}@example.com`));
  for (const { id } of fixtureUsers) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw error;
  }
});

async function signIn(page: Page, name: string, method: "password" | "google") {
  const user = users.get(name)!;
  await page.goto("/login");
  if (method === "google") {
    await page.goto(googleCallback(await startGoogle(page), user.id).href);
  } else {
    await page.getByLabel("Email", { exact: true }).fill(user.email);
    await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  }
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("button", { name: "Đăng xuất" })).toBeVisible();
}

// Tài khoản chưa có trang được mời tạo trang đầu tiên, và vẫn không đọc được trang của người khác.
async function expectAwaitingAccess(page: Page) {
  await expect(page.getByRole("heading", { name: "Tạo trang đầu tiên" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Tạo trang", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Đăng xuất" })).toBeVisible();
  const list = await page.request.get("/api/sites");
  expect(list.status()).toBe(200);
  expect(await list.json()).toEqual([]);
  expect((await page.request.get(path(assigned))).status()).toBe(404);
  expect((await page.request.get(history(assigned))).status()).toBe(404);
}

test("ACCESS-1 guests cannot open the dashboard or use the site API", async ({ page, baseURL }) => {
  await page.goto("/");
  await expect(page).toHaveURL("/login");
  for (const endpoint of [
    "/api/sites",
    path(assigned),
    history(assigned),
    path(assigned) + "/traffic",
    path(assigned) + "?revision=published",
  ]) {
    expect((await page.request.get(endpoint)).status()).toBe(401);
  }
  expect((await page.request.patch(path(assigned), { headers: { Origin: baseURL! }, data: assigned })).status()).toBe(
    401,
  );
});

test("ACCESS-2 OWN-1 a verified registration starts with no sites and creates its first one", async ({
  page,
  request,
  baseURL,
}) => {
  const email = `registration-${suffix}@example.com`;
  await page.goto("/register");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByLabel("Xác nhận mật khẩu", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Đăng ký", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Kiểm tra email" })).toBeVisible();
  const link = await latestMailLink(request, email);
  expect(link.origin).toBe(baseURL);
  await page.goto(link.href);
  await page.getByRole("button", { name: "Xác nhận email", exact: true }).click();
  await expect(page).toHaveURL("/");
  await expectAwaitingAccess(page);

  // Chọn template, đặt slug, rồi vào thẳng trình sửa của trang mới.
  await page.getByLabel("Slug", { exact: true }).fill(firstSite);
  await page.getByRole("button", { name: "Tạo trang", exact: true }).click();
  await expect(page).toHaveURL(`/?tab=bio&slug=${firstSite}`);
  await expect(page.getByRole("textbox", { name: "Tên", exact: true })).toHaveValue(firstSite);
  await expect(page.getByRole("textbox", { name: "Tên", exact: true })).toBeEditable();
});

test("ACCESS-2 a first Google sign-in starts with zero site access", async ({ page }) => {
  await createUser("new-google", false);
  await signIn(page, "new-google", "google");
  await expectAwaitingAccess(page);
});

test("ACCESS-3 viewer permissions stay read-only when switching from password to Google", async ({ page, baseURL }) => {
  for (const method of ["password", "google"] as const) {
    await signIn(page, "viewer", method);
    await page.getByRole("link", { name: "Link in bio", exact: true }).click();
    await expect(page.getByText("Chỉ xem", { exact: true })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Tên", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Xuất bản", exact: true })).toHaveCount(0);

    const list = await page.request.get("/api/sites");
    expect(list.status()).toBe(200);
    expect(await list.json()).toMatchObject([{ slug: assigned.slug, canEdit: false }]);
    expect((await page.request.get(path(assigned))).status()).toBe(200);
    const versions = await page.request.get(history(assigned));
    expect(versions.status()).toBe(200);
    const [version] = await versions.json();
    expect(version.note).toBe("Bản đầu tiên");
    const headers = { Origin: baseURL! };
    expect((await page.request.patch(path(assigned), { headers, data: assigned })).status()).toBe(403);
    expect((await page.request.put(path(assigned), { headers, data: assigned })).status()).toBe(403);
    expect((await page.request.post(path(assigned), { headers, data: {} })).status()).toBe(403);
    expect((await page.request.post(history(assigned), { headers, data: { versionId: version.id } })).status()).toBe(
      403,
    );
    expect((await page.request.get(path(other))).status()).toBe(404);
    expect((await page.request.get(path(other) + "/traffic")).status()).toBe(404);
    expect((await page.request.get(path(other) + "?revision=published")).status()).toBe(404);
    await page.getByRole("button", { name: "Đăng xuất" }).click();
    await expect(page).toHaveURL("/login");
  }
});

test("ACCESS-4 an editor can save, publish, and restore only their assigned site", async ({ page, baseURL }) => {
  await signIn(page, "editor", "google");
  await page.getByRole("link", { name: "Link in bio", exact: true }).click();
  await expect(page.getByRole("button", { name: "Xuất bản", exact: true })).toBeEnabled();
  const list = await page.request.get("/api/sites");
  expect(list.status()).toBe(200);
  expect(await list.json()).toMatchObject([{ slug: assigned.slug, canEdit: true }]);
  const versions = await page.request.get(history(assigned));
  expect(versions.status()).toBe(200);
  const [original] = await versions.json();

  const headers = { Origin: baseURL! };
  const updated = { ...assigned, profile: { ...assigned.profile, title: "Bản sửa của editor" } };
  await page.getByRole("textbox", { name: "Tên", exact: true }).fill(updated.profile.title);
  const saved = page.waitForResponse(
    (response) => response.request().method() === "PATCH" && new URL(response.url()).pathname === path(assigned),
  );
  await page.getByRole("button", { name: "Lưu nháp", exact: true }).click();
  const save = await saved;
  expect(save.status()).toBe(200);
  expect(await save.json()).toMatchObject(updated);
  const publish = await page.request.post(path(assigned), { headers, data: { note: "Xuất bản của editor" } });
  expect(publish.status()).toBe(200);
  const restore = await page.request.post(history(assigned), { headers, data: { versionId: original.id } });
  expect(restore.status()).toBe(200);
  expect(await restore.json()).toMatchObject(assigned);
  const restored = await page.request.get(history(assigned));
  expect(restored.status()).toBe(200);
  expect(await restored.json()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ restored_from: original.id }),
      expect.objectContaining({ note: "Xuất bản của editor" }),
    ]),
  );

  expect((await page.request.get(path(other))).status()).toBe(404);
  expect((await page.request.get(history(other))).status()).toBe(404);
  expect((await page.request.patch(path(other), { headers, data: other })).status()).toBe(404);
  expect((await page.request.post(history(other), { headers, data: { versionId: original.id } })).status()).toBe(404);
});

test("ACCESS-5 the admin sees and can edit all sites", async ({ page, baseURL }) => {
  await signIn(page, "admin", "password");
  await page.getByRole("combobox", { name: "Chọn slug" }).click();
  await expect(page.getByRole("option", { name: `Trang Alpha · /${assigned.slug}` })).toBeVisible();
  await page.getByRole("option", { name: `Trang Beta · /${other.slug}` }).click();
  await page.getByRole("link", { name: "Link in bio", exact: true }).click();
  await expect(page.getByRole("button", { name: "Xuất bản", exact: true })).toBeEnabled();

  const list = await page.request.get("/api/sites");
  expect(list.status()).toBe(200);
  // Admin thấy mọi trang, kể cả trang người dùng tự tạo trong các test trước.
  expect(await list.json()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ slug: assigned.slug, canEdit: true, canManage: true }),
      expect.objectContaining({ slug: other.slug, canEdit: true, canManage: true }),
    ]),
  );
  for (const site of [assigned, other]) {
    expect((await page.request.get(path(site))).status()).toBe(200);
    expect((await page.request.get(history(site))).status()).toBe(200);
  }
  expect((await page.request.patch(path(other), { headers: { Origin: baseURL! }, data: other })).status()).toBe(200);
});

test("ACCESS-6 cookie writes require the exact origin while valid bearer writes still work", async ({
  page,
  request,
  browser,
  baseURL,
}) => {
  await signIn(page, "editor", "password");
  const changed = { ...assigned, profile: { ...assigned.profile, title: "Sửa từ origin khác" } };
  const otherScheme = baseURL!.replace(/^http:/, "https:");
  for (const origin of ["https://example.invalid", otherScheme]) {
    const denied = await page.request.patch(path(assigned), { headers: { Origin: origin }, data: changed });
    expect(denied.status()).toBe(403);
  }
  expect((await page.request.patch(path(assigned), { headers: { Origin: baseURL! }, data: assigned })).status()).toBe(
    200,
  );

  const { data, error } = await localAuth().auth.signInWithPassword({ email: users.get("editor")!.email, password });
  if (error || !data.session) throw error ?? new Error("Không lấy được phiên kiểm thử.");
  const bearer = await request.patch(path(assigned), {
    headers: { Origin: otherScheme, Authorization: `Bearer ${data.session.access_token}` },
    data: assigned,
  });
  expect(bearer.status()).toBe(200);

  const alias = new URL(baseURL!);
  alias.hostname = "localhost";
  const alternate = await browser.newContext({ baseURL: alias.origin });
  try {
    const otherPage = await alternate.newPage();
    await signIn(otherPage, "editor", "password");
    const sameOrigin = await otherPage.request.patch(path(assigned), {
      headers: { Origin: alias.origin },
      data: assigned,
    });
    expect(sameOrigin.status()).toBe(200);
  } finally {
    await alternate.close();
  }
});

test("ADMIN-1 ADMIN-2 the admin tab keeps unsaved edits on other sites and follows a rename", async ({ page }) => {
  await signIn(page, "admin", "password");
  await page.goto(`/?tab=bio&slug=${assigned.slug}`);
  const title = page.getByRole("textbox", { name: "Tên", exact: true });
  await title.fill("Chưa lưu của admin");
  const picker = page.getByRole("combobox", { name: "Chọn slug" });

  await page.getByRole("link", { name: "Quản lý trang", exact: true }).click();
  await expect(page.getByText(`/${assigned.slug} có thay đổi chưa lưu`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Đổi slug", exact: true })).toBeDisabled();
  await page.getByLabel("Slug", { exact: true }).fill(created);
  await page.getByRole("button", { name: "Tạo trang", exact: true }).click();
  await expect(picker).toContainText(`/${created}`);

  // Creating another site must not drop the unsaved draft of this one.
  await picker.click();
  await page.getByRole("option", { name: `Trang Alpha · /${assigned.slug}` }).click();
  await page.getByRole("link", { name: "Link in bio", exact: true }).click();
  await expect(title).toHaveValue("Chưa lưu của admin");

  await picker.click();
  await page.getByRole("option", { name: `${created} · /${created}` }).click();
  await page.getByRole("link", { name: "Quản lý trang", exact: true }).click();
  await page.getByLabel("Slug mới", { exact: true }).fill(renamed);
  await page.getByRole("button", { name: "Đổi slug", exact: true }).click();
  await expect(picker).toContainText(`/${renamed}`);
  await picker.click();
  await expect(page.getByRole("option", { name: `${created} · /${renamed}` })).toBeVisible();
  await expect(page.getByRole("option", { name: new RegExp(`/${created}$`) })).toHaveCount(0);
});
