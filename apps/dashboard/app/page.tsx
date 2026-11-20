import { Suspense } from "react";
import Editor from "@/components/Editor";
import { getSupabaseEnv, requireUser } from "@/lib/auth";

export default function Page() {
  return (
    <Suspense fallback={<main className="p-8 text-sm">Đang tải…</main>}>
      <Dashboard />
    </Suspense>
  );
}

async function Dashboard() {
  if (!getSupabaseEnv()) {
    return <main className="p-8 text-sm">Thêm cấu hình Supabase vào apps/dashboard/.env.local.</main>;
  }

  const user = await requireUser();
  const landingUrl = process.env.NEXT_PUBLIC_LANDING_URL ?? "http://localhost:4321";
  return <Editor key={user.id} email={user.email ?? ""} landingUrl={landingUrl} />;
}
