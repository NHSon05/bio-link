import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { BrandMark } from "@/components/topbar";
import type { Metadata } from "next";
import { Suspense } from "react";
import { safeNext } from "@/lib/auth";
import { signInWithGoogle } from "./actions";
import LoginForm from "./LoginForm";

export const metadata: Metadata = { title: "Đăng nhập · bio-link" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-16">
      <Card className="[--card-spacing:--spacing(6)]">
        <CardHeader>
          <BrandMark className="mb-2" />
          <CardTitle className="text-xl font-semibold tracking-[-0.03em]">Đăng nhập bio-link</CardTitle>
          <CardDescription>Dùng tài khoản được cấp trong Supabase.</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense>
            <Form searchParams={searchParams} />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}

async function Form({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const { next, error } = await searchParams;
  const destination = safeNext(Array.isArray(next) ? next[0] : next);
  return (
    <>
      <LoginForm next={destination} />
      <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
        <Separator className="flex-1" />
        hoặc
        <Separator className="flex-1" />
      </div>
      <form action={signInWithGoogle} className="flex flex-col gap-3">
        <input type="hidden" name="next" value={destination} />
        {error === "google" && (
          <p role="alert" className="text-sm text-destructive">
            Không đăng nhập được với Google. Vui lòng thử lại.
          </p>
        )}
        <Button type="submit" variant="outline" size="lg">
          Đăng nhập với Google
        </Button>
      </form>
    </>
  );
}
