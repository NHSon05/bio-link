import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const options = { auth: { autoRefreshToken: false, persistSession: false } };

export function localAdmin() {
  return createClient(process.env.AUTH_TEST_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, options);
}

export function localAuth() {
  return createClient(process.env.AUTH_TEST_SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, options);
}

export function testSql(sql: string, variables: Record<string, string> = {}) {
  const project = process.env.AUTH_TEST_PROJECT_ID;
  if (!project || !/^bio-link-auth-[a-z0-9]+$/.test(project)) throw new Error("Cần môi trường kiểm thử riêng.");

  const result = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      `supabase_db_${project}`,
      "psql",
      "-U",
      "postgres",
      "-X",
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
      ...Object.entries(variables).flatMap(([name, value]) => ["-v", `${name}=${value}`]),
    ],
    { input: sql, encoding: "utf8" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}
