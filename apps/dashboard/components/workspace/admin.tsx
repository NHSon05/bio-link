"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import { templates } from "@bio-link/templates";
import { Panel } from "@/components/panel";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWorkspaceApi, type Member, type Role, type SiteSummary } from "@/lib/workspace-api";

const roles: { value: Role; label: string }[] = [
  { value: "editor", label: "Biên tập" },
  { value: "viewer", label: "Chỉ xem" },
];

/** Admin: tạo, đổi slug, xóa trang và giao quyền (ADMIN-1…3, MEM-1…3). */
export function AdminPanel({
  site,
  dirty,
  changed,
}: {
  site?: SiteSummary;
  /** Trang đang chọn có thay đổi chưa lưu: chặn đổi slug và xóa để không mất bản nháp. */
  dirty: boolean;
  /** `next`: slug to open; `previous`: slug whose cached draft is now stale. */
  changed: (next?: string, previous?: string) => void;
}) {
  return (
    <div className="grid gap-5">
      <h1 className="workspace-title">Quản trị</h1>
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <CreateSite changed={changed} />
        {site && <Members key={site.slug} slug={site.slug} />}
        {site && dirty && (
          <Alert className="xl:col-span-2">
            <AlertDescription>
              /{site.slug} có thay đổi chưa lưu. Lưu hoặc bỏ thay đổi trước khi đổi slug hay xóa trang.
            </AlertDescription>
          </Alert>
        )}
        {site && <RenameSite key={"rename-" + site.slug} slug={site.slug} locked={dirty} changed={changed} />}
        {site && <DeleteSite key={"delete-" + site.slug} slug={site.slug} locked={dirty} changed={changed} />}
      </div>
    </div>
  );
}

/** Chạy một thao tác, giữ trạng thái đang gửi và thông báo lỗi. */
function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const alert = error && (
    <Alert variant="destructive">
      <AlertDescription className="whitespace-pre-line">{error}</AlertDescription>
    </Alert>
  );
  return { busy, run, alert };
}

function submit(handler: (form: FormData, element: HTMLFormElement) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    handler(new FormData(e.currentTarget), e.currentTarget);
  };
}

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

function CreateSite({ changed }: { changed: (next?: string) => void }) {
  const api = useWorkspaceApi();
  const { busy, run, alert } = useAction();
  return (
    <Panel title="Tạo trang mới" hint="Trang mới là bản nháp trống, chưa công khai cho đến khi xuất bản.">
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={submit(async (form) => {
          const slug = text(form, "slug");
          const title = text(form, "title");
          const platform = text(form, "platform");
          const created = await run(() =>
            api.createSite({
              slug,
              template: text(form, "template"),
              ...(title && { title }),
              ...(platform && { platform }),
            }),
          );
          if (created) changed(slug);
        })}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="new-slug">Slug</Label>
          <Input id="new-slug" name="slug" required pattern="[a-z0-9-]+" maxLength={64} placeholder="fanpage-abc" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="new-title">Tên trang</Label>
          <Input id="new-title" name="title" maxLength={120} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="new-template">Template</Label>
          <Select name="template" defaultValue="classic">
            <SelectTrigger id="new-template" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.values(templates).map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="new-platform">Nền tảng</Label>
          <Input id="new-platform" name="platform" maxLength={40} placeholder="facebook, tiktok, instagram" />
        </div>
        <div className="sm:col-span-2">{alert}</div>
        <Button className="w-fit" disabled={busy}>
          Tạo trang
        </Button>
      </form>
    </Panel>
  );
}

function Members({ slug }: { slug: string }) {
  const api = useWorkspaceApi();
  const [members, setMembers] = useState<Member[] | null>(null);
  const { busy, run, alert } = useAction();
  useEffect(() => {
    const ctl = new AbortController();
    run(() => api.members(slug, ctl.signal).then(setMembers));
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tải một lần cho mỗi slug
  }, [api, slug]);
  const save = (email: string, role: Role) =>
    run(async () => {
      const member = await api.setMember(slug, email, role);
      setMembers((prev) =>
        [...(prev ?? []).filter((m) => m.userId !== member.userId), member].sort((a, b) =>
          a.email.localeCompare(b.email),
        ),
      );
    });
  return (
    <Panel title={`Thành viên · /${slug}`} hint="Quản trị viên luôn có toàn quyền nên không cần thêm vào đây.">
      <div className="grid gap-3">
        {members?.length === 0 && <p className="text-sm text-muted-foreground">Chưa có thành viên.</p>}
        <ul className="grid gap-2" aria-label="Danh sách thành viên">
          {members?.map((m) => (
            <li key={m.userId} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm">{m.email}</span>
              <Select value={m.role} disabled={busy} onValueChange={(role) => save(m.email, role as Role)}>
                <SelectTrigger aria-label={`Quyền của ${m.email}`} className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon"
                disabled={busy}
                aria-label={`Gỡ ${m.email}`}
                onClick={() =>
                  run(async () => {
                    await api.removeMember(slug, m.userId);
                    setMembers((prev) => prev?.filter((x) => x.userId !== m.userId) ?? null);
                  })
                }
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={submit(async (form, element) => {
            if (await save(text(form, "email"), text(form, "role") as Role)) element.reset();
          })}
        >
          <div className="grid min-w-48 flex-1 gap-1.5">
            <Label htmlFor="member-email">Email</Label>
            <Input id="member-email" name="email" type="email" required />
          </div>
          <Select name="role" defaultValue="editor">
            <SelectTrigger aria-label="Quyền" className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {roles.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button disabled={busy}>Thêm</Button>
        </form>
        {alert}
      </div>
    </Panel>
  );
}

type SiteAction = { slug: string; locked: boolean; changed: (next?: string, previous?: string) => void };

function RenameSite({ slug, locked, changed }: SiteAction) {
  const api = useWorkspaceApi();
  const { busy, run, alert } = useAction();
  return (
    <Panel title="Đổi slug">
      <form
        className="grid gap-3"
        onSubmit={submit(async (form) => {
          const newSlug = text(form, "newSlug");
          if (await run(() => api.renameSite(slug, newSlug))) changed(newSlug, slug);
        })}
      >
        <Alert>
          <AlertDescription>
            /{slug} sẽ chuyển hướng sang slug mới sau lần build tiếp theo. Hãy cập nhật đường dẫn trong banner Linktree
            để khách không phải qua bước chuyển hướng.
          </AlertDescription>
        </Alert>
        <div className="grid gap-1.5">
          <Label htmlFor="rename-slug">Slug mới</Label>
          <Input id="rename-slug" name="newSlug" required pattern="[a-z0-9-]+" maxLength={64} />
        </div>
        {alert}
        <Button className="w-fit" disabled={busy || locked}>
          Đổi slug
        </Button>
      </form>
    </Panel>
  );
}

function DeleteSite({ slug, locked, changed }: SiteAction) {
  const api = useWorkspaceApi();
  const [confirm, setConfirm] = useState("");
  const { busy, run, alert } = useAction();
  return (
    <Panel title="Xóa trang" hint="Xóa cả thành viên, lịch sử phiên bản và thống kê. Không thể hoàn tác.">
      <form
        className="grid gap-3"
        onSubmit={submit(async () => {
          if (await run(() => api.deleteSite(slug))) changed(undefined, slug);
        })}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="delete-confirm">Nhập {slug} để xác nhận</Label>
          <Input id="delete-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        {alert}
        <Button variant="destructive" className="w-fit" disabled={busy || locked || confirm !== slug}>
          Xóa trang
        </Button>
      </form>
    </Panel>
  );
}
