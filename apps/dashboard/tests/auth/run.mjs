import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const dashboard = fileURLToPath(new URL("../../", import.meta.url));
const source = fileURLToPath(new URL("../../../../supabase/", import.meta.url));
const workdir = mkdtempSync(join(tmpdir(), "bio-link-auth-"));
const projectId = basename(workdir).toLowerCase();
const testSupabase = join(workdir, "supabase");
const args = process.argv.slice(2);
const env = { ...process.env, DO_NOT_TRACK: "1" };

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: dashboard,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args[0]} exited with ${result.status ?? result.signal}`);
  return result.stdout;
}

let networkCreated = false;
try {
  env.DOCKER_HOST ||= run("docker", ["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"]).trim();
  mkdirSync(testSupabase);
  cpSync(join(source, "migrations"), join(testSupabase, "migrations"), { recursive: true });
  cpSync(join(source, "templates"), join(testSupabase, "templates"), { recursive: true });
  const config = readFileSync(join(source, "config.toml"), "utf8")
    .replace(/^project_id = .*$/m, `project_id = "${projectId}"`)
    .replace(/^port = 5432([123])$/gm, "port = 5532$1")
    .replace(/^shadow_port = 54320$/m, "shadow_port = 55320")
    .replace("[db.seed]\nenabled = true", "[db.seed]\nenabled = false")
    .replace("[auth]\nenabled = true", "[auth]\nenabled = true\njwt_expiry = 60")
    .replace(/^enable_signup = false$/m, "enable_signup = true")
    .replace('site_url = "http://localhost:3000"', 'site_url = "http://127.0.0.1:55300"');
  writeFileSync(
    join(testSupabase, "config.toml"),
    `${config}\n[local_smtp]\nport = 55324\n\n[auth.email]\nenable_confirmations = true\n`,
  );

  run("docker", ["network", "create", "-o", "com.docker.network.bridge.host_binding_ipv4=127.0.0.1", projectId]);
  networkCreated = true;
  run("supabase", ["start", "--workdir", workdir, "--agent=no", "--network-id", projectId]);
  const status = JSON.parse(run("supabase", ["status", "--workdir", workdir, "--agent=no", "-o", "json"]));
  const { API_URL: url, PUBLISHABLE_KEY: publishable, SECRET_KEY: secret } = status;
  if (url !== "http://127.0.0.1:55321" && url !== "http://localhost:55321") {
    throw new Error("Expected a local Supabase API on port 55321");
  }
  const publishableKey = publishable || status.ANON_KEY;
  const secretKey = secret || status.SERVICE_ROLE_KEY;
  if (!publishableKey || !secretKey) throw new Error("Local Supabase did not return its API keys");

  run("pnpm", ["exec", "playwright", "test", ...args], {
    env: {
      ...env,
      AUTH_TEST_PROJECT_ID: projectId,
      AUTH_TEST_MAILPIT_URL: "http://127.0.0.1:55324",
      AUTH_TEST_SUPABASE_URL: url,
      SUPABASE_URL: url,
      SUPABASE_PUBLISHABLE_KEY: publishableKey,
      SUPABASE_SECRET_KEY: secretKey,
    },
    stdio: "inherit",
  });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (networkCreated) {
    try {
      run("supabase", ["stop", "--workdir", workdir, "--agent=no", "--no-backup"]);
      run("docker", ["network", "rm", projectId]);
    } catch (error) {
      console.error(`Could not clean up test project ${projectId}: ${error.message}`);
      process.exitCode = 1;
    }
  }
  rmSync(workdir, { recursive: true, force: true });
}
