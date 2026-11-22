"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWorkspaceApi } from "@/lib/workspace-api";

/** Ô đường dẫn ảnh kèm nút tải ảnh lên bucket media (MEDIA-1); ảnh chỉ vào bản nháp khi lưu. */
export function ImageField({
  id,
  label,
  slug,
  value,
  onChange,
}: {
  id: string;
  label: string;
  slug: string;
  value: string;
  onChange: (url: string) => void;
}) {
  const api = useWorkspaceApi();
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-1.5">
        <Input id={id} value={value} placeholder="https://…" onChange={(e) => onChange(e.target.value)} />
        <Button type="button" variant="outline" disabled={busy} onClick={() => file.current?.click()}>
          <Upload />
          {busy ? "Đang tải…" : "Tải ảnh"}
        </Button>
        <input
          ref={file}
          type="file"
          hidden
          aria-label={`Tải ảnh cho ${label}`}
          accept="image/webp,image/avif,image/png,image/jpeg"
          onChange={async (e) => {
            const picked = e.target.files?.[0];
            e.target.value = "";
            if (!picked) return;
            setBusy(true);
            setError("");
            try {
              onChange((await api.upload(slug, picked)).url);
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        />
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
