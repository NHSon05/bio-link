# API contract

This contract defines the observable HTTP behavior for the features in [plan.md](plan.md). Task rows in the plan cite these IDs, and tests should use the same IDs in their names. Auth routes (`/login`, `/auth/*`) are defined separately in [AUTH_CONTRACT.md](auth/AUTH_CONTRACT.md).

Each endpoint is marked **Implemented** (matches the code today) or **Proposed** (to build). If an implemented endpoint and this file disagree, treat it as a bug in one of them and resolve it before changing either.

## Common rules

These apply to every dashboard endpoint under `/api` unless the endpoint says otherwise.

**Authentication.** Send either the Supabase session cookie or `Authorization: Bearer <access token>`. A missing or invalid session returns `401`.

**Origin check.** A write (`POST`, `PUT`, `PATCH`, `DELETE`) authenticated by cookie must come from the dashboard origin. Otherwise it returns `403`. Bearer requests skip this check.

**Roles.** Roles come from `site_admins` (global) and `site_members` (per site, `owner`, `editor`, or `viewer`). Any signed-in user can create sites (`ADMIN-1`) and becomes their `owner` (AD-12).

| Actor                    | Read assigned site | Change assigned site | Unassigned site | Manage site (`ADMIN-2…3`, `MEM-1…3`) |
| ------------------------ | ------------------ | -------------------- | --------------- | ------------------------------------ |
| Signed in, no assignment | —                  | —                    | `404`           | `403`                                |
| Viewer                   | `200`              | `403`                | `404`           | `403`                                |
| Editor                   | `200`              | `200`                | `404`           | `403`                                |
| Owner                    | `200`              | `200`                | `404`           | `200` (own sites)                    |
| Admin                    | `200` (all sites)  | `200` (all sites)    | —               | `200` (all sites)                    |

Managing returns `403` for anyone who is neither admin nor the site's owner, also for a slug that does not exist.

An unassigned site returns `404`, not `403`, so the API does not reveal which slugs exist.

**Request bodies.** JSON with `Content-Type: application/json`, validated by Zod from `@bio-link/schema` or the route. A body that fails validation returns `422`. A malformed JSON body returns `400`.

**Responses.** Success bodies are JSON unless the endpoint says `204`. Errors always have this shape, with a Vietnamese message safe to show in the UI:

```json
{ "error": "Không tìm thấy slug" }
```

Validation errors join issues as `path: message` lines in `error`. Unexpected failures return `500` with a generic message and are logged on the server.

**Caching.** Every dashboard API response sends `Cache-Control: private, no-store`.

**Slugs.** Match `^[a-z0-9-]+$`, 1–64 characters, and must not be a reserved word (`preview`, `api`, `sitemap`, `assets`, `_astro`).

**Timestamps.** ISO 8601 strings in UTC.

### Shared types

```ts
type Site = z.infer<typeof SiteSchema>; // packages/schema: slug, template, theme, layout, profile, blocks, updatedAt, …

type SiteSummary = {
  slug: string;
  title: string | null;
  template: string; // "classic" when unset
  platform: string | null;
  updatedAt: string;
  canEdit: boolean; // owner, editor, or admin
  canManage: boolean; // owner or admin
  publishedSlug: string | null;
};

type Version = {
  id: number;
  published_by: string | null; // user id
  published_at: string;
  note: string | null;
  restored_from: number | null;
};

type Role = "editor" | "viewer";
type BuildStatus = "queued" | "running" | "succeeded" | "failed";
```

---

## Current user

### ME-1 — `GET /api/me` · Implemented

Returns who is signed in so the dashboard can hide actions the user cannot perform. The server still enforces every permission.

- `200`
  ```json
  { "userId": "uuid", "email": "a@b.vn", "isAdmin": false, "username": "lan" }
  ```
  `username` is `null` until the user claims one (`ME-2`).
- `401` without a session.

### ME-2 — `POST /api/me/username` · Implemented

Claims the user's username, the first segment of every site URL `/{username}/{slug}` (AD-13). It can be set once and never changed, because changing it would break every shared link.

- Body: `{ "username": string }` — 2–32 characters `a-z`, `0-9`, `-`, not starting with `-`.
- `201` `{ "username": "lan" }`.
- `409` the user already has a username, or another user took it. `422` invalid or reserved (`admin`, `api`, `preview`, `sitemap`, `assets`, `img`, `static`, `www`, `app`, `dashboard`, `runtime`, `favicon`).
- `401` without a session.

## Sites (editor)

A site's `slug` is its full path `username/page` (AD-13), for example `lan/page-abc`. Two users can each have `page-abc`; `{slug}` in the routes below is that full path, so `/api/sites/lan/page-abc`.

### SITE-1 — `GET /api/sites` · Implemented

Lists the sites the user can read, ordered by slug.

- `200` `SiteSummary[]`. Admins see all sites. A user with no assignments gets `[]`.
- `401` without a session.

### SITE-2 — `GET /api/sites/{slug}` · Implemented

Returns the site's **draft** config by default. Add `?revision=published` to read the published configuration with the same site permissions. A site awaiting its first publication returns `404` for that revision.

- `200` `Site`
- `404` when the slug does not exist or is not assigned to the user.

### SITE-3 — `PATCH /api/sites/{slug}` · Implemented

Saves the draft. Does not publish and does not create a version.

- Body: `Site`. `body.slug` must equal `{slug}`.
- `200` `Site` as saved, with `updatedAt` set by the server.
- `403` viewer. `404` unknown or unassigned slug. `422` invalid config or slug mismatch.
- Concurrent saves are ordered by a row lock; the last write wins.

### SITE-4 — `POST /api/sites/{slug}` · Implemented

Publishes the current draft and records a version.

- Body (optional): `{ "note"?: string }`, trimmed, at most 500 characters.
- `200` `Site` that was published.
- `403` viewer. `404` unknown or unassigned slug. `422` note too long.
- Side effect: queues a build for this slug (`BUILD-1`). A failed build hook call does not change the `200` result.

### SITE-5 — `PUT /api/sites/{slug}` · Implemented

Saves a full config and publishes it in one call. Same body and errors as `SITE-3`, same result and side effects as `SITE-4`. The editor's "Xuất bản" uses it: saving and publishing in one locked call means a concurrent `PATCH` cannot slip between them (F2-11).

## Versions

### VER-1 — `GET /api/sites/{slug}/versions?before={id}` · Implemented

Lists published versions, newest first, at most 100 per page.

- `before` (optional): positive integer; returns versions with `id < before`. Use the last `id` of a page as the next cursor. A page with fewer than 100 items is the last one.
- `200` `Version[]`; each item includes `published_by_email: string | null` (null when the publisher's account is gone).
- `404` unknown or unassigned slug. `422` invalid `before`.

### VER-2 — `POST /api/sites/{slug}/versions` · Implemented

Restores an old version by publishing its config as a **new** version. History is never deleted. The draft is replaced by the restored config.

- Body: `{ "versionId": number, "note"?: string }`
- `200` `Site` that was published. The new version has `restored_from = versionId`.
- `403` viewer. `404` unknown slug, unassigned slug, or a version that belongs to another site. `422` invalid body.
- Side effect: queues a build with `reason: "restore"`, as in `SITE-4`.

## Preview (landing app)

### PREV-1 — `/preview` on the internal Astro server · Implemented

Renders a site with the production templates. Not deployed to the CDN.

- `GET /preview?slug={slug}` → `200` HTML of the published config. Falls back to the first published site when the slug is unknown. `404` when nothing is published.
- `POST /preview` with body `Site` (`application/json`), or a form POST (`application/x-www-form-urlencoded` or `multipart/form-data`) whose `site` field is the `Site` JSON → `200` HTML of the draft. `422` HTML error page when the body is invalid. The dashboard uses the form POST as the preview iframe's navigation, so the page and its assets load from the landing origin.
- `OPTIONS /preview` from `DASHBOARD_ORIGIN` → `204` with CORS headers for `POST` and `Content-Type`. Any other origin → `403`.
- A `POST` from an origin other than `DASHBOARD_ORIGIN` or the preview server itself → `403`.
- Every response sends `Cache-Control: no-store`. Click and subscribe events are not sent from preview pages.

## Site administration (owner or admin)

### ADMIN-1 — `POST /api/sites` · Implemented

Creates a site with an empty draft. Nothing is published until `SITE-4`. Any signed-in user may call it; a non-admin becomes the site's `owner`.

- Body: `{ "slug": string, "template": string, "title"?: string, "platform"?: string, "namespace"?: string }`. `slug` is the page part only; the site is created at `{namespace}/{slug}`, where `namespace` defaults to the caller's username.
- `201` `Site` (the new draft, `slug` is the full path). The draft uses the template's default theme, regions, and an empty `blocks` list.
- `403` a non-admin who already owns 3 sites, or passes a `namespace` other than their own. `409` the caller has no username yet (`ME-2`), or the path is already used by a site or by a redirect in `slug_redirects`. `422` invalid slug or namespace, or unknown template.

### ADMIN-2 — `POST /api/sites/{slug}/rename` · Implemented

Changes the slug and keeps the old URL working.

- Body: `{ "newSlug": string }` — the page part only; the site stays under the same username.
- `200` `{ "slug": "lan/new-slug", "redirectFrom": "lan/old-slug" }`. Updates `slug` in the row, the draft, and the published config, and inserts a row in `slug_redirects`. Members and versions stay attached to the site.
- Side effect: queues a build for both the old and new slug (`BUILD-1`, `reason: "rename"`). The deployment serves `/{newSlug}` and a redirect from `/{oldSlug}` (`PUB-4`).
- `403` neither admin nor owner. `404` unknown slug (admin). `409` `newSlug` taken. `422` invalid slug, or `newSlug` equals the current slug.

### ADMIN-3 — `DELETE /api/sites/{slug}` · Implemented

Deletes a site, its members, versions, and scores.

- Body: `{ "confirm": string }`, which must equal `{slug}`.
- `204`
- Side effect: queues a build for the deleted slug and its former redirect slugs (`BUILD-1`, `reason: "delete"`). The deployment removes their old files from the CDN.
- `403` neither admin nor owner. `404` unknown slug (admin). `422` missing or wrong `confirm`.

## Members (owner or admin)

### MEM-1 — `GET /api/sites/{slug}/members` · Implemented

- `200` `{ "userId": string, "email": string, "role": "owner" | Role }[]`, ordered by email.
- `403` neither admin nor owner. `404` unknown slug (admin).

### MEM-2 — `PUT /api/sites/{slug}/members` · Implemented

Adds a member or changes their role. Idempotent.

- Body: `{ "email": string, "role": Role }`
- `200` `{ "userId": string, "email": string, "role": Role }`
- `Role` is `editor` or `viewer`; nobody can grant `owner` here.
- `403` neither admin nor owner. `404` unknown slug (admin) or no account with that email. `409` an owner tries to change an owner's role (only an admin can). `422` invalid email or role.

### MEM-3 — `DELETE /api/sites/{slug}/members/{userId}` · Implemented

- `204`, also when the user was not a member.
- `403` neither admin nor owner. `404` unknown slug (admin). `409` an owner tries to remove an owner (only an admin can).

## Media

### MEDIA-1 — `POST /api/sites/{slug}/media` · Implemented

Uploads an image for use in the site's config.

- Body: `multipart/form-data` with one `file` field. Allowed types: `image/webp`, `image/avif`, `image/png`, `image/jpeg`. Maximum 5 MB.
- `201` `{ "url": "https://…/media/sites/{slug}/{uuid}.webp", "width": number, "height": number, "bytes": number }`
- `403` viewer. `404` unknown or unassigned slug. `413` file too large. `415` type not allowed. `422` missing file.
- The upload does not change the draft; the client puts `url` into the config and saves with `SITE-3`.

## Builds and deploys

### BUILD-1 — Build hook (outbound) · Implemented (dashboard)

After a successful publish, restore, rename, or delete, the dashboard queues a build (`queue_build`) and, unless the request was merged, triggers GitHub Actions.

- `POST https://api.github.com/repos/{BUILD_REPO}/dispatches` with `Authorization: Bearer {BUILD_HOOK_TOKEN}` (a fine-grained token with Contents: write on that repo only) and body:
  ```json
  { "event_type": "build-landing", "client_payload": { "buildId": 42, "reason": "publish", "slugs": ["fanpage-abc"] } }
  ```
- `reason` is one of `publish`, `restore`, `rename`, `delete`, `products`, `scores`, `cron`, `manual`. `slugs` is empty for a full build. Rename lists both slugs. Delete lists the removed slug and its former redirects.
- A request within 60 seconds of a still-`queued` build is merged into it and does not call the hook again.
- The dashboard waits at most 10 seconds for `2xx`. A failed or slow call is logged and leaves the build `queued`. The planned worker can absorb that build on its next run (`BUILD-2`). If the queue itself is unavailable after a site change has committed, the dashboard logs the error and preserves the successful site response.
- When `BUILD_HOOK_TOKEN` is unset (local dev), builds are queued without calling GitHub. Set `BUILD_REPO` to `owner/repo` when enabling the hook.

### BUILD-2 — `POST /api/internal/builds/{buildId}` · Implemented

The build job reports progress. Not for browsers.

- Auth: `Authorization: Bearer {BUILD_CALLBACK_TOKEN}` only. Cookies are ignored. Compared in constant time.
- Body: `{ "status": "running" | "succeeded" | "failed", "error"?: string }`. `error` is at most 2000 characters.
- `running`: `200` `{ "id": 42, "status": "running", "slugs": string[] }`. Every older `queued` build becomes `superseded` and its slugs are merged in, so the job builds and invalidates the returned `slugs`, not the ones it was dispatched with. Empty means everything.
- `succeeded` / `failed`: `200` `{ "id": 42, "status": "succeeded" }`.
- `401` missing or wrong token. `404` unknown build. `409` transition not allowed (only `queued → running → succeeded | failed`; a superseded build answers `409`, and the job exits without deploying). `422` invalid body.
- `POST /api/internal/builds/cron` (same auth, no body) creates a full `cron` build already `running`, fails `running` builds older than one hour, and answers like `running` above. The workflow calls it on its hourly schedule.

### BUILD-3 — `GET /api/sites/{slug}/builds/latest` · Implemented

Any role on the site.

- `200`
  ```json
  {
    "id": 42,
    "status": "succeeded",
    "reason": "publish",
    "requestedAt": "…",
    "finishedAt": "…",
    "error": null,
    "liveUpdatedAt": "…",
    "publishedUpdatedAt": "…"
  }
  ```
  `status` is `queued`, `running`, `succeeded`, or `failed`. `liveUpdatedAt` is the `updatedAt` of the newest version published before the last successful build covering this slug started, or `null` if none has. `publishedUpdatedAt` is the published config's `updatedAt` (`null` if never published). The editor shows "Đã lên CDN" when the two are equal, "Build lỗi" when `status` is `failed`, and otherwise "Đang cập nhật CDN…", checking again every 5 seconds. A request merged into a queued build keeps that build's `reason`.
- `404` unknown or unassigned slug, or no build yet.

### BUILD-4 — `POST /api/builds` · Implemented

Manually queues a build, for example after a failed deploy. Admins can build anything; an owner can rebuild only sites they own (the editor's "Build lại" button). Same merge and hook rules as `BUILD-1`, with `reason: "manual"`.

- Body: `{ "slugs"?: string[] }`. Empty or missing means a full build.
- `202` `{ "id": number, "status": "queued" }`
- `403` neither admin nor the owner of every listed slug; a full build is admin-only. `422` invalid slug, or a slug that does not exist or the caller cannot read.

## Public artifacts (CDN)

These are static files produced by `pnpm build:landing` and served by CloudFront. No auth.

Public URLs are `/{username}/{slug}` (AD-13); `{slug}` below is that full path.

### PUB-1 — `GET /{slug}` · Implemented (build), Proposed (headers)

- `200` HTML with OG tags, theme variables, and every block already in the markup.
- Headers: `Cache-Control: public, max-age=300, s-maxage=31536000`, set on upload to S3. The deploy invalidates `/{slug}`, `/{slug}/*`, and `/{slug}.json` for the build's slugs, or `/*` for a full build.
- Unknown slug → the CDN's `404` page.

### PUB-2 — `GET /{slug}.json` · Implemented (build), Proposed (headers)

Ranking data for the runtime. Contains block ids only; the runtime reorders blocks already in the HTML and never renders new ones.

- `200`
  ```json
  {
    "slug": "admin/fanpage-abc",
    "updatedAt": "2026-11-19T09:00:00Z",
    "order": { "hero": ["v1"], "main": ["p1", "c1"], "footer": ["l1"] }
  }
  ```
- Headers: `Content-Type: application/json`, `Cache-Control: public, max-age=60, s-maxage=300`.
- The runtime ignores ids it cannot find in the page and keeps blocks missing from `order` in their HTML position.

### PUB-3 — `GET /sitemap.xml` · Proposed

Lists `/{slug}` for every published site, with `<lastmod>` from `updatedAt`. Excludes `/preview` and redirected slugs.

### PUB-4 — `GET /{oldSlug}` after a rename · Implemented (static page), Proposed (CDN 301)

Sites created before AD-13 moved from `/{slug}` to `/admin/{slug}`; their old one-segment paths are redirects too.

Returns a `301` to `/{newSlug}` (CloudFront function or S3 redirect rule), keeping the query string so UTM parameters survive. If the CDN cannot return a real redirect, serve a static page with `<meta http-equiv="refresh">` and a canonical link.

## Products and collections

The workspace currently saves each site's catalog with its draft and published configs through SITE-3 and SITE-4. The proposed shared-catalog API below makes products and collections available across sites. Reading needs any signed-in user with at least one assignment or admin. Writing needs an editor on at least one site, or admin.

```ts
type Product = z.infer<typeof ProductSchema>; // id, url, affiliateUrl, network, name, image, price, currency, hidden, …
type Collection = { id: string; name: string; items: string[] }; // product ids, ordered, at most 20
type Network = "shopee" | "lazada" | "tiki" | "amazon" | "tiktok-shop" | "shopify" | "other";
```

### PROD-1 — `POST /api/products/lookup` · Proposed

Reads metadata from a product URL without saving anything.

- Body: `{ "url": string }`, `http` or `https` only.
- `200`
  ```json
  {
    "url": "https://shopee.vn/…",
    "network": "shopee",
    "affiliateUrl": "https://shopee.vn/…?utm_source=biolink",
    "name": "Sản phẩm A",
    "image": "https://…",
    "price": 199000,
    "currency": "VND",
    "complete": true
  }
  ```
  When the page blocks bots or renders with JS, returns `200` with `complete: false` and whatever fields were found. The client then shows the manual form. `affiliateUrl` is always present.
- `422` invalid URL, or a host that resolves to a private, loopback, or link-local address.
- The server fetch times out after 8 seconds, follows at most 3 redirects, and reads at most 2 MB.

### PROD-2 — `GET /api/products` · Proposed

- Query: `q` (optional, matches name or URL), `network` (optional), `includeHidden` (default `false`).
- `200` `Product[]`, newest first.

### PROD-3 — `POST /api/products` · Proposed

- Body: `Product` without `id`. Usually the result of `PROD-1` after manual edits.
- `201` `Product`
- `403` viewer-only user. `409` a product with the same `url` exists (body includes its `id`). `422` invalid body.

### PROD-4 — `PATCH /api/products/{id}` · Proposed

- Body: partial `Product` without `id`.
- `200` `Product`
- Side effect: queues a build for every site with a `shop` block that uses a collection containing this product (`BUILD-1`, `reason: "products"`).
- `403`, `404`, `422` as above.

### PROD-5 — `DELETE /api/products/{id}` · Proposed

- `204`. Also removes the id from every collection, and queues builds as in `PROD-4`.
- `403`, `404`.

### COLL-1 — `GET /api/collections` · Proposed

- `200` `Collection[]` ordered by name.

### COLL-2 — `POST /api/collections` · Proposed

- Body: `{ "name": string, "items"?: string[] }`
- `201` `Collection`
- `403`. `422` empty name, more than 20 items, duplicate ids, or unknown product id.

### COLL-3 — `PATCH /api/collections/{id}` · Proposed

- Body: `{ "name"?: string, "items"?: string[] }`. `items` replaces the whole ordered list.
- `200` `Collection`. Queues builds for sites that use the collection.
- `403`, `404`, `422` as in `COLL-2`.

### COLL-4 — `DELETE /api/collections/{id}` · Proposed

- `204`
- `403`, `404`. `409` when a site's published config still references the collection; the body lists those slugs.

## Tracking and analytics

The signed-in Home screen reads `GET /api/sites/{slug}/traffic`. It returns 30 daily totals with `day`, `views`, and `clicks` in Vietnam time, including days with zero traffic. The endpoint uses the site read permissions from SITE-2.

The public runtime sends `{ "slug": "...", "kind": "view" }` on page load and `kind: "click"` on tracked link clicks to `POST /api/traffic`. The endpoint accepts the configured landing origin and increments daily counters for published slugs. Dashboard previews skip both events.

### EVT-1 — `POST {PUBLIC_BEACON_URL}` (`/api/events`) · Proposed

Receives events from the landing runtime. Public, no auth.

- Sent by `navigator.sendBeacon` with `Content-Type: text/plain` so the browser skips the CORS preflight. The body is JSON:
  ```json
  {
    "type": "click",
    "slug": "fanpage-abc",
    "blockId": "p1",
    "position": "main:2",
    "url": "https://…",
    "ts": 1763542800000
  }
  ```
  `type` is `click` or `view` and defaults to `click` (the current runtime omits it). `view` events omit `blockId`, `position`, and `url`.
- `204` on success, including for unknown slugs (dropped silently) so the endpoint does not reveal which slugs exist.
- `400` body is not JSON or over 2 KB. `422` invalid fields. `429` rate limit (default 60 events per minute per IP and slug).
- `Access-Control-Allow-Origin` is the landing origin only. The server sets `received_at` and ignores `ts` older than 24 hours.

### ANA-1 — `GET /api/sites/{slug}/analytics?from={date}&to={date}` · Proposed

- `from` and `to` are `YYYY-MM-DD` in `Asia/Ho_Chi_Minh`, inclusive, at most 90 days apart. Default: the last 7 days.
- `200`
  ```json
  {
    "range": { "from": "2026-11-13", "to": "2026-11-19" },
    "views": 1240,
    "clicks": 318,
    "daily": [{ "date": "2026-11-13", "views": 170, "clicks": 41 }],
    "blocks": [{ "blockId": "p1", "clicks": 120, "ctr": 0.097 }]
  }
  ```
  `ctr` is block clicks divided by page views for the range. `blocks` is ordered by clicks.
- `404` unknown or unassigned slug. `422` invalid or too wide range.

## Subscribe

### SUB-1 — `POST {PUBLIC_SUBSCRIBE_URL}` (`/api/subscribe`) · Proposed

Receives the subscribe form from a landing page. Public, no auth.

- `Content-Type: text/plain`, body JSON: `{ "email": string, "slug": string, "ts": number, "website"?: string }`. `website` is a hidden honeypot field.
- `204` on success, for duplicates, and when the honeypot is filled (the entry is dropped). The response never reveals whether the email was already subscribed.
- `422` invalid email or unknown slug. `429` more than 5 requests per minute per IP.
- `Access-Control-Allow-Origin` is the landing origin only.
- If double opt-in is adopted (F8-5), the endpoint stores the entry unconfirmed and sends a confirmation email. The response does not change.

### SUB-2 — `GET /api/sites/{slug}/subscribers` · Proposed

Readable by the site's editors and admins (viewers get `403` because the list contains personal data).

- Query: `before` (cursor, optional), `format` (`json` default, or `csv`).
- `200` JSON `{ "items": [{ "email": string, "createdAt": string, "confirmedAt": string | null }], "next": string | null }`, 100 per page.
- `200` CSV with `Content-Disposition: attachment; filename="{slug}-subscribers.csv"` when `format=csv`, all rows.
- `403` viewer. `404` unknown or unassigned slug.

## Ranking automation

### SCORE-1 — `POST /api/internal/scores` · Proposed

n8n reports viral scores. Scores are stored in `block_scores`, never in the draft or published config, so automation does not create versions or overwrite an editor's draft.

- Auth: `Authorization: Bearer {AUTOMATION_TOKEN}` only.
- Body:
  ```json
  {
    "slug": "fanpage-abc",
    "scores": [{ "blockId": "v1", "score": 87.5, "publishedAt": "2026-11-01T00:00:00Z" }],
    "rebuild": true
  }
  ```
  `score` is a number ≥ 0. At most 200 entries. Blocks not listed keep their current score.
- `200` `{ "updated": 1, "ignored": ["unknown-id"], "buildId": 43 | null }`. Ids not in the published config are ignored and listed. When `rebuild` is true and any score changed, queues a build (`BUILD-1`, `reason: "scores"`).
- `401` missing or wrong token. `404` unknown slug. `422` invalid body.
- The landing build merges these scores into blocks before ranking, so the order in `PUB-2` follows `pinned → score → publishedAt → editor order`.

### SCORE-2 — `GET /api/sites/{slug}/scores` · Proposed

- `200` `{ "blockId": string, "score": number, "publishedAt": string | null, "updatedAt": string }[]`
- `404` unknown or unassigned slug.

## Environment variables introduced by this contract

| Name                   | App / job          | Purpose                                        |
| ---------------------- | ------------------ | ---------------------------------------------- |
| `BUILD_REPO`           | dashboard (server) | GitHub repository (`owner/repo`) for `BUILD-1` |
| `BUILD_HOOK_TOKEN`     | dashboard (server) | Bearer token sent to the build hook            |
| `BUILD_CALLBACK_TOKEN` | dashboard, CI      | Bearer token for `BUILD-2`                     |
| `AUTOMATION_TOKEN`     | dashboard, n8n     | Bearer token for `SCORE-1`                     |
| `LANDING_ORIGIN`       | dashboard (server) | CORS origin for `EVT-1` and `SUB-1`            |
| `PUBLIC_BEACON_URL`    | landing (build)    | Already read by `SitePage.astro` for EVT-1     |
| `PUBLIC_SUBSCRIBE_URL` | landing (build)    | Already read by `Subscribe.astro` for SUB-1    |

Keep tokens server-side only and add placeholders to `apps/dashboard/.env.example` when the endpoint ships.
