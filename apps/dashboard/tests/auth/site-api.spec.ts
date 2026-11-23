import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { expect, test, type APIRequestContext, type APIResponse } from "@playwright/test";
import { SiteSchema, type Site } from "@bio-link/schema";
import sharp from "sharp";
import { localAdmin, localAuth, testSql } from "./local-supabase";

// HTTP contract tests for ME-1, SITE-1…5, VER-1…2 (F2-8), ADMIN-1…3, MEM-1…3 (F3-7) and MEDIA-1 (F4-5).
// Requests use bearer tokens; cookie auth and the origin check are covered by site-access.spec.ts.

const admin = localAdmin();
const suffix = randomUUID().slice(0, 8);
const password = `P4ssword-${randomUUID()}`;
const site = (name: string, title = name) => SiteSchema.parse({ slug: `${name}-${suffix}`, profile: { title } });
const assigned = site("api-alpha", "Trang Alpha");
const other = site("api-beta", "Trang Beta");
const draftOnly = site("api-draft");
const actors = ["nobody", "viewer", "editor", "admin"] as const;
type Actor = (typeof actors)[number];
const users = new Map<Actor | "newcomer", { id: string; email: string }>();
const tokens = new Map<string, { token: string; at: number }>();

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  for (const name of [...actors, "newcomer"] as const) {
    const email = `api-${name}-${suffix}@example.com`;
    const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true, password });
    if (error) throw error;
    users.set(name, { id: data.user.id, email });
  }
  testSql(
    `begin;
     with fixtures as (
       insert into public.sites (slug, draft_config, published_config)
       values (:'a', :'a_config'::jsonb, :'a_config'::jsonb), (:'b', :'b_config'::jsonb, :'b_config'::jsonb)
       returning id, published_config
     )
     insert into public.site_versions (site_id, config, note) select id, published_config, 'Bản đầu tiên' from fixtures;
     insert into public.sites (slug, draft_config) values (:'c', :'c_config'::jsonb);
     insert into public.site_members (user_id, site_id, role)
       select assignment.user_id, site.id, assignment.role from public.sites as site
       cross join (values (:'viewer'::uuid, 'viewer'), (:'editor'::uuid, 'editor')) as assignment(user_id, role)
       where site.slug in (:'a', :'c');
     insert into public.site_admins (user_id) values (:'admin'::uuid);
     commit;`,
    {
      a: assigned.slug,
      a_config: JSON.stringify(assigned),
      b: other.slug,
      b_config: JSON.stringify(other),
      c: draftOnly.slug,
      c_config: JSON.stringify(draftOnly),
      viewer: users.get("viewer")!.id,
      editor: users.get("editor")!.id,
      admin: users.get("admin")!.id,
    },
  );
});

test.afterAll(async () => {
  testSql(`delete from public.sites where slug like '%-' || :'suffix';`, { suffix });
  for (const { id } of users.values()) await admin.auth.admin.deleteUser(id);
});

/** Test Auth issues 60-second tokens, so sign in again when a cached one is close to expiry. */
async function as(name: Actor | "newcomer") {
  const cached = tokens.get(name);
  if (cached && Date.now() - cached.at < 40_000) return { Authorization: `Bearer ${cached.token}` };
  const { data, error } = await localAuth().auth.signInWithPassword({ email: users.get(name)!.email, password });
  if (error || !data.session) throw error ?? new Error("Không lấy được phiên kiểm thử.");
  tokens.set(name, { token: data.session.access_token, at: Date.now() });
  return { Authorization: `Bearer ${data.session.access_token}` };
}

const pngImage = () =>
  sharp({ create: { width: 40, height: 30, channels: 3, background: "#cbd77e" } })
    .png()
    .toBuffer();

const path = (s: Site | string) => `/api/sites/${typeof s === "string" ? s : s.slug}`;

async function expectError(response: APIResponse, status: number) {
  expect(response.status(), await response.text()).toBe(status);
  expect(response.headers()["cache-control"]).toBe("private, no-store");
  expect(await response.json()).toEqual({ error: expect.any(String) });
}

async function firstVersion(request: APIRequestContext, s: Site) {
  const response = await request.get(`${path(s)}/versions`, { headers: await as("admin") });
  return (await response.json()).at(-1).id as number;
}

test("BUILD-1 queues successful publishing changes even if GitHub fails", async ({ request }) => {
  const buildSite = site("api-build");
  const renamed = site("api-build-renamed").slug;
  const headers = await as("admin");
  const logPath = process.env.AUTH_TEST_BUILD_DISPATCH_LOG!;
  const dispatches = () => (existsSync(logPath) ? readFileSync(logPath, "utf8").trim().split("\n") : []);
  const builds = () =>
    JSON.parse(
      testSql(
        `select coalesce(json_agg(b order by id), '[]') from (
           select id, status, reason, slugs, requested_by from public.builds where :'slug' = any(slugs)
         ) b;`,
        { slug: buildSite.slug },
      ),
    ) as { id: number; slugs: string[]; status: string; reason: string; requested_by: string }[];

  // Mô phỏng hết cửa sổ gộp mà không phải chờ 60 giây.
  const expireMergeWindow = () =>
    testSql("update public.builds set requested_at = now() - interval '61 seconds' where status = 'queued';");
  expireMergeWindow();
  const attemptsBefore = dispatches().length;
  expect((await request.post("/api/sites", { headers, data: { ...buildSite, template: "classic" } })).status()).toBe(
    201,
  );
  expect((await request.patch(path(buildSite), { headers, data: buildSite })).status()).toBe(200);
  await expectError(await request.post(path(buildSite), { headers: await as("viewer") }), 404);
  expect(builds()).toEqual([]);
  expect(dispatches()).toHaveLength(attemptsBefore);

  expect((await request.post(path(buildSite), { headers })).status()).toBe(200);
  expect((await request.get(path(buildSite) + "?revision=published", { headers })).status()).toBe(200);
  expect(builds()).toEqual([
    {
      id: expect.any(Number),
      status: "queued",
      reason: "publish",
      slugs: [buildSite.slug],
      requested_by: users.get("admin")!.id,
    },
  ]);
  const [{ id }] = builds();
  expect(dispatches()).toHaveLength(attemptsBefore + 1);
  expect(JSON.parse(dispatches().at(-1)!)).toEqual({
    method: "POST",
    body: { event_type: "build-landing", client_payload: { buildId: id, reason: "publish", slugs: [buildSite.slug] } },
  });

  const versionId = await firstVersion(request, buildSite);
  expireMergeWindow();
  expect((await request.put(path(buildSite), { headers, data: buildSite })).status()).toBe(200);
  expect(builds().at(-1)).toMatchObject({ reason: "publish", status: "queued", slugs: [buildSite.slug] });
  expect(dispatches()).toHaveLength(attemptsBefore + 2);

  expireMergeWindow();
  expect((await request.post(path(buildSite) + "/versions", { headers, data: { versionId } })).status()).toBe(200);
  const restored = builds().at(-1);
  expect(restored).toMatchObject({ reason: "restore", status: "queued", slugs: [buildSite.slug] });
  expect(dispatches()).toHaveLength(attemptsBefore + 3);

  expect((await request.post(path(buildSite) + "/rename", { headers, data: { newSlug: renamed } })).status()).toBe(200);
  expect(builds()).toHaveLength(3);
  expect(builds().at(-1)).toMatchObject({
    id: restored?.id,
    status: "queued",
    slugs: [buildSite.slug, renamed].sort(),
  });
  expect(dispatches()).toHaveLength(attemptsBefore + 3);

  expireMergeWindow();
  expect((await request.delete(path(renamed), { headers, data: { confirm: renamed } })).status()).toBe(204);
  expect(builds()).toHaveLength(4);
  expect(builds().at(-1)).toMatchObject({ status: "queued", reason: "delete", slugs: [renamed, buildSite.slug] });
  expect(dispatches()).toHaveLength(attemptsBefore + 4);
});

test("BUILD-2 lets only the build job move a build through its states", async ({ request }) => {
  const url = (id: number | string) => `/api/internal/builds/${id}`;
  const job = { Authorization: "Bearer callback-test-only" };
  const queue = (slugs: string) =>
    Number(
      testSql(
        `with b as (insert into public.builds (reason, slugs) values ('manual', :'slugs') returning id) select id from b;`,
        {
          slugs,
        },
      ),
    );
  const status = (id: number) => testSql(`select status from public.builds where id = ${id};`).trim();
  const older = queue(`{build2-old-${suffix}}`);
  const id = queue(`{build2-${suffix}}`);

  // Một phiên admin hợp lệ vẫn không phải token build.
  const attempts: Record<string, string>[] = [{}, { Authorization: "Bearer wrong" }, await as("admin")];
  for (const headers of attempts) {
    await expectError(await request.post(url(id), { headers, data: { status: "running" } }), 401);
  }
  await expectError(await request.post("/api/internal/builds/cron", { headers: {} }), 401);
  expect(status(id)).toBe("queued");

  await expectError(await request.post(url(id), { headers: job, data: { status: "done" } }), 422);
  await expectError(await request.post(url(id), { headers: job, data: Buffer.from("{not json") }), 400);
  for (const missing of ["999999999", "abc", "0"]) {
    await expectError(await request.post(url(missing), { headers: job, data: { status: "running" } }), 404);
  }
  await expectError(await request.post(url(id), { headers: job, data: { status: "succeeded" } }), 409);

  const started = await request.post(url(id), { headers: job, data: { status: "running" } });
  expect(started.status()).toBe(200);
  expect(await started.json()).toEqual({
    id,
    status: "running",
    slugs: expect.arrayContaining([`build2-${suffix}`, `build2-old-${suffix}`]),
  });
  expect(status(older)).toBe("superseded");
  await expectError(await request.post(url(older), { headers: job, data: { status: "running" } }), 409);
  await expectError(await request.post(url(id), { headers: job, data: { status: "running" } }), 409);

  const finished = await request.post(url(id), { headers: job, data: { status: "failed", error: "x".repeat(2000) } });
  expect(await finished.json()).toEqual({ id, status: "failed" });
  await expectError(await request.post(url(id), { headers: job, data: { status: "succeeded" } }), 409);
  await expectError(
    await request.post(url(queue("{}")), { headers: job, data: { status: "running", error: "x".repeat(2001) } }),
    422,
  );

  const cron = await request.post("/api/internal/builds/cron", { headers: job });
  expect(cron.status()).toBe(200);
  const cronBuild = await cron.json();
  expect(cronBuild).toEqual({ id: expect.any(Number), status: "running", slugs: [] });
  expect(await (await request.post(url(cronBuild.id), { headers: job, data: { status: "succeeded" } })).json()).toEqual(
    { id: cronBuild.id, status: "succeeded" },
  );
});

test("ME-1 returns the signed-in user and admin flag", async ({ request }) => {
  await expectError(await request.get("/api/me"), 401);
  for (const name of actors) {
    const response = await request.get("/api/me", { headers: await as(name) });
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("private, no-store");
    expect(await response.json()).toEqual({
      userId: users.get(name)!.id,
      email: users.get(name)!.email,
      isAdmin: name === "admin",
    });
  }
});

test("SITE-1 lists only readable sites with canEdit", async ({ request }) => {
  const list = async (name: Actor) => (await request.get("/api/sites", { headers: await as(name) })).json();
  expect(await list("nobody")).toEqual([]);
  expect(await list("viewer")).toMatchObject([
    { slug: assigned.slug, title: "Trang Alpha", template: "classic", canEdit: false, publishedSlug: assigned.slug },
    { slug: draftOnly.slug, canEdit: false, publishedSlug: null },
  ]);
  expect(await list("editor")).toMatchObject([{ slug: assigned.slug, canEdit: true }, { slug: draftOnly.slug }]);
  const all: { slug: string; canEdit: boolean }[] = await list("admin");
  expect(all.filter((s) => s.slug.endsWith(suffix))).toMatchObject([
    { slug: assigned.slug, canEdit: true },
    { slug: other.slug, canEdit: true },
    { slug: draftOnly.slug, canEdit: true },
  ]);
});

test("SITE-1…5 VER-1…2 follow the role matrix", async ({ request }) => {
  const read = { nobody: 404, viewer: 200, editor: 200, admin: 200 };
  const write = { nobody: 404, viewer: 403, editor: 200, admin: 200 };
  const versionId = await firstVersion(request, assigned);
  for (const name of actors) {
    const headers = await as(name);
    const cases: [string, Promise<APIResponse>, number][] = [
      ["SITE-2 draft", request.get(path(assigned), { headers }), read[name]],
      ["SITE-2 published", request.get(path(assigned) + "?revision=published", { headers }), read[name]],
      ["VER-1", request.get(path(assigned) + "/versions", { headers }), read[name]],
      ["SITE-3", request.patch(path(assigned), { headers, data: assigned }), write[name]],
      ["SITE-4", request.post(path(assigned), { headers, data: { note: `Xuất bản bởi ${name}` } }), write[name]],
      ["SITE-5", request.put(path(assigned), { headers, data: assigned }), write[name]],
      ["VER-2", request.post(path(assigned) + "/versions", { headers, data: { versionId } }), write[name]],
    ];
    for (const [id, pending, status] of cases) {
      const response = await pending;
      expect(response.status(), `${id} as ${name}`).toBe(status);
      expect(response.headers()["cache-control"]).toBe("private, no-store");
    }
    // Không ai ngoài admin thấy trang chưa được giao.
    expect((await request.get(path(other), { headers })).status()).toBe(name === "admin" ? 200 : 404);
  }
});

test("SITE-2 reads the draft or the published revision", async ({ request }) => {
  const headers = await as("editor");
  const draft = { ...draftOnly, profile: { ...draftOnly.profile, title: "Chỉ có bản nháp" } };
  expect((await request.patch(path(draftOnly), { headers, data: draft })).status()).toBe(200);
  expect(await (await request.get(path(draftOnly), { headers })).json()).toMatchObject(draft);
  await expectError(await request.get(path(draftOnly) + "?revision=published", { headers }), 404);
  await expectError(await request.get(path(`missing-${suffix}`), { headers }), 404);
});

test("SITE-3 saves a draft without publishing", async ({ request }) => {
  const headers = await as("editor");
  const before = await (await request.get(path(assigned) + "/versions", { headers })).json();
  const changed = { ...assigned, profile: { ...assigned.profile, title: "Nháp mới" } };
  const response = await request.patch(path(assigned), { headers, data: changed });
  expect(response.status()).toBe(200);
  const saved = await response.json();
  expect(saved).toMatchObject(changed);
  expect(Date.parse(saved.updatedAt)).toBeGreaterThan(Date.now() - 60_000);
  expect(await (await request.get(path(assigned) + "?revision=published", { headers })).json()).not.toMatchObject(
    changed,
  );
  expect(await (await request.get(path(assigned) + "/versions", { headers })).json()).toHaveLength(before.length);

  await expectError(await request.patch(path(assigned), { headers, data: { ...assigned, slug: other.slug } }), 422);
  await expectError(await request.patch(path(assigned), { headers, data: { slug: assigned.slug } }), 422);
  await expectError(
    await request.patch(path(assigned), {
      headers: { ...headers, "Content-Type": "application/json" },
      data: Buffer.from("{not json"),
    }),
    400,
  );
});

test("SITE-4 publishes the draft with a note and records a version", async ({ request }) => {
  const headers = await as("editor");
  const draft = await (await request.get(path(assigned), { headers })).json();
  const response = await request.post(path(assigned), { headers, data: { note: "  Ghi chú  " } });
  expect(response.status()).toBe(200);
  const published = await response.json();
  expect(published.profile).toEqual(draft.profile);
  expect(await (await request.get(path(assigned) + "?revision=published", { headers })).json()).toEqual(published);
  const [latest] = await (await request.get(path(assigned) + "/versions", { headers })).json();
  expect(latest).toMatchObject({
    note: "Ghi chú",
    published_by: users.get("editor")!.id,
    published_by_email: users.get("editor")!.email,
    restored_from: null,
  });

  expect((await request.post(path(assigned), { headers })).status()).toBe(200); // body is optional
  await expectError(await request.post(path(assigned), { headers, data: { note: "x".repeat(501) } }), 422);
});

test("VER-1 pages versions newest first with a cursor", async ({ request }) => {
  const headers = await as("viewer");
  const versions: { id: number; published_at: string }[] = await (
    await request.get(path(assigned) + "/versions", { headers })
  ).json();
  expect(versions.length).toBeGreaterThan(2);
  expect(versions.map((v) => v.id)).toEqual([...versions.map((v) => v.id)].sort((a, b) => b - a));
  expect(Object.keys(versions[0]).sort()).toEqual([
    "id",
    "note",
    "published_at",
    "published_by",
    "published_by_email",
    "restored_from",
  ]);
  const page = await (await request.get(`${path(assigned)}/versions?before=${versions[1].id}`, { headers })).json();
  expect(page.map((v: { id: number }) => v.id)).toEqual(versions.slice(2).map((v) => v.id));
  for (const before of ["abc", "0", "-1", "1.5"]) {
    await expectError(await request.get(`${path(assigned)}/versions?before=${before}`, { headers }), 422);
  }
});

test("VER-2 restores a version as a new published version", async ({ request }) => {
  const headers = await as("editor");
  const versionId = await firstVersion(request, assigned);
  const response = await request.post(path(assigned) + "/versions", {
    headers,
    data: { versionId, note: "Khôi phục" },
  });
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ profile: { title: "Trang Alpha" } });
  const [latest] = await (await request.get(path(assigned) + "/versions", { headers })).json();
  expect(latest).toMatchObject({ restored_from: versionId, note: "Khôi phục" });
  expect(await (await request.get(path(assigned), { headers })).json()).toMatchObject({
    profile: { title: "Trang Alpha" },
  });

  const foreign = await firstVersion(request, other);
  await expectError(await request.post(path(assigned) + "/versions", { headers, data: { versionId: foreign } }), 404);
  await expectError(await request.post(path(assigned) + "/versions", { headers, data: {} }), 422);
});

test("ADMIN-1…3 MEM-1…3 reject non-admins with 403", async ({ request, baseURL }) => {
  for (const name of ["nobody", "viewer", "editor"] as const) {
    const headers = await as(name);
    const slug = `x-${name}-${suffix}`;
    const cases: Promise<APIResponse>[] = [
      request.post("/api/sites", { headers, data: { slug, template: "classic" } }),
      request.post(path(assigned) + "/rename", { headers, data: { newSlug: slug } }),
      request.delete(path(assigned), { headers, data: { confirm: assigned.slug } }),
      request.get(path(assigned) + "/members", { headers }),
      request.put(path(assigned) + "/members", {
        headers,
        data: { email: users.get("newcomer")!.email, role: "editor" },
      }),
      request.delete(`${path(assigned)}/members/${users.get("viewer")!.id}`, { headers }),
    ];
    for (const pending of cases) await expectError(await pending, 403);
  }
  for (const pending of [
    request.post("/api/sites", { headers: { Origin: baseURL! }, data: {} }),
    request.get(path(assigned) + "/members"),
  ]) {
    await expectError(await pending, 401);
  }
});

test("ADMIN-1 creates an empty draft from a template", async ({ request }) => {
  const headers = await as("admin");
  const slug = `created-${suffix}`;
  const body = { slug, template: "video-first", title: "Trang mới", platform: "tiktok" };
  const response = await request.post("/api/sites", { headers, data: body });
  expect(response.status(), await response.text()).toBe(201);
  expect(await response.json()).toMatchObject({
    slug,
    template: "video-first",
    profile: { title: "Trang mới" },
    source: { platform: "tiktok" },
    blocks: [],
  });
  expect(await (await request.get(path(slug), { headers })).json()).toMatchObject({ slug, blocks: [] });
  await expectError(await request.get(path(slug) + "?revision=published", { headers }), 404);
  expect(
    (await (await request.get("/api/sites", { headers })).json()).find((s: { slug: string }) => s.slug === slug),
  ).toMatchObject({ title: "Trang mới", template: "video-first", platform: "tiktok", publishedSlug: null });

  const members = await request.get(path(slug) + "/members", { headers });
  expect(members.status()).toBe(200);
  expect(await members.json()).toEqual([]);
  await expectError(await request.post("/api/sites", { headers, data: body }), 409);
  for (const data of [
    { slug: "api", template: "classic" },
    { slug: "preview", template: "classic" },
    { slug: "Bad Slug", template: "classic" },
    { slug: "x".repeat(65), template: "classic" },
    { slug: `t-${suffix}`, template: "missing-template" },
    { template: "classic" },
  ]) {
    await expectError(await request.post("/api/sites", { headers, data }), 422);
  }
});

test("ADMIN-2 renames a slug and keeps a redirect", async ({ request }) => {
  const headers = await as("admin");
  const from = `rename-${suffix}`;
  const to = `renamed-${suffix}`;
  expect((await request.post("/api/sites", { headers, data: { slug: from, template: "classic" } })).status()).toBe(201);
  expect((await request.post(path(from), { headers, data: { note: "v1" } })).status()).toBe(200);
  testSql(
    `insert into public.site_members (user_id, site_id, role)
     select :'editor'::uuid, id, 'editor' from public.sites where slug = :'from';`,
    { editor: users.get("editor")!.id, from },
  );

  const response = await request.post(path(from) + "/rename", { headers, data: { newSlug: to } });
  expect(response.status(), await response.text()).toBe(200);
  expect(await response.json()).toEqual({ slug: to, redirectFrom: from });
  await expectError(await request.get(path(from), { headers }), 404);
  expect((await (await request.get(path(to), { headers })).json()).slug).toBe(to);
  expect((await (await request.get(path(to) + "?revision=published", { headers })).json()).slug).toBe(to);
  expect(testSql("select count(*) from public.slug_redirects where from_slug = :'from';", { from })).toBe("1");
  // Same query as loadRedirects() in the landing build (PUB-4).
  const { data: redirects, error } = await admin
    .from("slug_redirects")
    .select("from_slug, sites!inner(slug)")
    .not("sites.published_config", "is", null);
  if (error) throw error;
  expect(redirects).toContainEqual({ from_slug: from, sites: { slug: to } });

  // Members and versions stay attached; restoring an old version keeps the new slug.
  const editor = await as("editor");
  expect((await request.get(path(to), { headers: editor })).status()).toBe(200);
  const [version] = await (await request.get(path(to) + "/versions", { headers })).json();
  const restored = await request.post(path(to) + "/versions", { headers, data: { versionId: version.id } });
  expect(restored.status(), await restored.text()).toBe(200);
  expect((await restored.json()).slug).toBe(to);

  // The old slug stays reserved by its redirect, except for renaming back.
  await expectError(await request.post("/api/sites", { headers, data: { slug: from, template: "classic" } }), 409);
  await expectError(await request.post(path(to) + "/rename", { headers, data: { newSlug: assigned.slug } }), 409);
  await expectError(await request.post(path(to) + "/rename", { headers, data: { newSlug: to } }), 422);
  await expectError(await request.post(path(to) + "/rename", { headers, data: { newSlug: "sitemap" } }), 422);
  await expectError(
    await request.post(path(`missing-${suffix}`) + "/rename", { headers, data: { newSlug: `m-${suffix}` } }),
    404,
  );
  const back = await request.post(path(to) + "/rename", { headers, data: { newSlug: from } });
  expect(back.status()).toBe(200);
  expect(
    testSql("select from_slug from public.slug_redirects where from_slug in (:'from', :'to');", { from, to }),
  ).toBe(to);
});

test("ADMIN-3 deletes a site after confirmation", async ({ request }) => {
  const headers = await as("admin");
  const slug = `delete-${suffix}`;
  const first = `delete-first-${suffix}`;
  expect((await request.post("/api/sites", { headers, data: { slug: first, template: "classic" } })).status()).toBe(
    201,
  );
  // Images uploaded under the slug before a rename are removed with the site too.
  const upload = async (target: string) => {
    const file = { name: "a.png", mimeType: "image/png", buffer: await pngImage() };
    const response = await request.post(path(target) + "/media", { headers, multipart: { file } });
    expect(response.status()).toBe(201);
    return (await response.json()).url as string;
  };
  const images = [await upload(first)];
  expect((await request.post(path(first) + "/rename", { headers, data: { newSlug: slug } })).status()).toBe(200);
  images.push(await upload(slug));
  for (const url of images) expect((await request.get(url)).status()).toBe(200);
  await expectError(await request.delete(path(slug), { headers, data: { confirm: "wrong" } }), 422);
  await expectError(await request.delete(path(slug), { headers, data: {} }), 422);
  const response = await request.delete(path(slug), { headers, data: { confirm: slug } });
  expect(response.status()).toBe(204);
  expect(await response.text()).toBe("");
  await expectError(await request.get(path(slug), { headers }), 404);
  for (const url of images) expect((await request.get(url)).status()).not.toBe(200);
  await expectError(await request.delete(path(slug), { headers, data: { confirm: slug } }), 404);
});

test("MEM-1…3 list, assign, change, and remove members", async ({ request }) => {
  const headers = await as("admin");
  const members = path(assigned) + "/members";
  const newcomer = users.get("newcomer")!;
  const list = await request.get(members, { headers });
  expect(list.status()).toBe(200);
  expect(await list.json()).toEqual(
    [
      { userId: users.get("editor")!.id, email: users.get("editor")!.email, role: "editor" },
      { userId: users.get("viewer")!.id, email: users.get("viewer")!.email, role: "viewer" },
    ].sort((a, b) => a.email.localeCompare(b.email)),
  );

  await expectError(await request.get(path(assigned), { headers: await as("newcomer") }), 404);
  for (const role of ["viewer", "editor", "editor"] as const) {
    const response = await request.put(members, { headers, data: { email: newcomer.email.toUpperCase(), role } });
    expect(response.status(), await response.text()).toBe(200);
    expect(await response.json()).toEqual({ userId: newcomer.id, email: newcomer.email, role });
  }
  const access = await request.get("/api/sites", { headers: await as("newcomer") });
  expect(await access.json()).toMatchObject([{ slug: assigned.slug, canEdit: true }]);

  await expectError(
    await request.put(members, { headers, data: { email: `nobody-${suffix}@example.com`, role: "viewer" } }),
    404,
  );
  await expectError(await request.put(members, { headers, data: { email: "not-an-email", role: "viewer" } }), 422);
  await expectError(await request.put(members, { headers, data: { email: newcomer.email, role: "owner" } }), 422);
  await expectError(await request.get(path(`missing-${suffix}`) + "/members", { headers }), 404);

  for (const id of [newcomer.id, newcomer.id, "not-a-uuid"]) {
    const response = await request.delete(`${members}/${id}`, { headers });
    expect(response.status()).toBe(204);
  }
  await expectError(await request.get(path(assigned), { headers: await as("newcomer") }), 404);
  await expectError(await request.delete(`${path(`missing-${suffix}`)}/members/${newcomer.id}`, { headers }), 404);
});

test("MEDIA-1 uploads an image as WebP for editors", async ({ request }) => {
  const png = await pngImage();
  const upload = async (name: Actor, file: { name: string; mimeType: string; buffer: Buffer }, slug = assigned) =>
    request.post(path(slug) + "/media", { headers: await as(name), multipart: { file } });

  const response = await upload("editor", { name: "a.png", mimeType: "image/png", buffer: png });
  expect(response.status(), await response.text()).toBe(201);
  const body = await response.json();
  expect(body).toEqual({ url: expect.any(String), width: 40, height: 30, bytes: expect.any(Number) });
  expect(body.url).toMatch(new RegExp(`/media/sites/${assigned.slug}/[0-9a-f-]{36}\\.webp$`));
  const image = await request.get(body.url);
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toBe("image/webp");
  expect((await image.body()).length).toBe(body.bytes);
  // The upload does not touch the draft.
  expect(
    JSON.stringify(await (await request.get(path(assigned), { headers: await as("editor") })).json()),
  ).not.toContain(body.url);

  expect((await upload("admin", { name: "a.png", mimeType: "image/png", buffer: png }, other)).status()).toBe(201);
  await expectError(await upload("viewer", { name: "a.png", mimeType: "image/png", buffer: png }), 403);
  await expectError(await upload("nobody", { name: "a.png", mimeType: "image/png", buffer: png }), 404);
  await expectError(await upload("editor", { name: "a.png", mimeType: "image/png", buffer: png }, other), 404);
  await expectError(await upload("editor", { name: "a.gif", mimeType: "image/gif", buffer: png }), 415);
  await expectError(
    await upload("editor", { name: "a.png", mimeType: "image/png", buffer: Buffer.from("không phải ảnh") }),
    415,
  );
  await expectError(await upload("editor", { name: "a.jpg", mimeType: "image/jpeg", buffer: png }), 415);
  await expectError(
    await upload("editor", { name: "big.png", mimeType: "image/png", buffer: Buffer.alloc(5 * 1024 * 1024 + 1) }),
    413,
  );
  await expectError(
    await request.post(path(assigned) + "/media", { headers: await as("editor"), multipart: { other: "x" } }),
    422,
  );
});
