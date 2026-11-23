/**
 * Compile runtime bằng Google Closure Compiler (ADVANCED) → apps/landing/public/runtime.js.
 * Chạy: pnpm build:runtime (ở thư mục gốc). Astro nhúng file này bằng <script is:inline>.
 */
import { mkdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compiler as Compiler } from "google-closure-compiler";
import { getNativeImagePath } from "google-closure-compiler/lib/utils.js";

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "../../apps/landing/public/runtime.js");
mkdirSync(dirname(out), { recursive: true });

const compiler = new Compiler({
  js: resolve(here, "src/runtime.js"),
  externs: resolve(here, "src/externs.js"),
  compilation_level: "ADVANCED",
  language_out: "ECMASCRIPT_2017",
  warning_level: "VERBOSE",
  js_output_file: out,
});

// Bản native không cần Java; Vercel chỉ có Java 11 còn file .jar cần Java 21. Giống cli.js của gói.
const nativeCompiler = getNativeImagePath();
if (nativeCompiler) {
  compiler.JAR_PATH = null;
  compiler.javaPath = nativeCompiler;
}

compiler.run((code, stdout, stderr) => {
  if (stderr) process.stderr.write(stderr);
  if (code !== 0) process.exit(code);
  console.log(`runtime.js: ${statSync(out).size} bytes → ${out}`);
});
