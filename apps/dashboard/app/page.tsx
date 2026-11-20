import { connection } from "next/server";
import { Suspense } from "react";
import DashboardSession from "@/components/DashboardSession";

export default function Page() {
  return (
    <Suspense fallback={<main className="p-8 text-sm">Đang tải…</main>}>
      <Dashboard />
    </Suspense>
  );
}

async function Dashboard() {
  await connection();
  const url = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    return <main className="p-8 text-sm">Thêm cấu hình Supabase vào apps/dashboard/.env.local.</main>;
  }

  const landingUrl = process.env.NEXT_PUBLIC_LANDING_URL ?? "http://localhost:4321";
  return <DashboardSession url={url} publishableKey={publishableKey} landingUrl={landingUrl} />;
}
