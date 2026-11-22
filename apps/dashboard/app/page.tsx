import { Suspense } from "react";
import Editor from "@/components/Editor";
import { getSupabaseEnv, requireUser } from "@/lib/auth";
import MockEditor from "@/mocks/MockEditor";

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
  if ((process.env.WORKSPACE_DATA_SOURCE ?? "mock") === "mock") {
    return <MockEditor key={user.id} userId={user.id} email={user.email ?? ""} landingUrl={landingUrl} />;
  }
  return <Editor key={user.id} email={user.email ?? ""} landingUrl={landingUrl} />;
}
