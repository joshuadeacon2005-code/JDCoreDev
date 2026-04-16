import { build } from "esbuild";
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

console.log("Building frontend...");
execSync("npx vite build", { stdio: "inherit", cwd: root });

console.log("Building backend...");
await build({
  entryPoints: [path.join(root, "server/index.ts")],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: path.join(root, "dist/index.cjs"),
  packages: "external",
});

console.log("Build complete!");
