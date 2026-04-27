#!/usr/bin/env node
// jdcd-link — drop a .jdcd-project file in the current directory.
// Usage:  node link.mjs <projectId> [logType]
//   projectId — numeric project ID from jdcoredev.com
//   logType   — "hosting" or "development" (optional; auto-detected if omitted)

import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  console.log("Usage: node link.mjs <projectId> [hosting|development]");
  process.exit(args.length === 0 ? 1 : 0);
}

const projectId = parseInt(args[0], 10);
if (!Number.isFinite(projectId) || projectId <= 0) {
  console.error(`Invalid projectId: ${args[0]}`);
  process.exit(1);
}

const logType = args[1];
if (logType && !["hosting", "development"].includes(logType)) {
  console.error(`Invalid logType: ${logType} (must be 'hosting' or 'development')`);
  process.exit(1);
}

const target = path.join(process.cwd(), ".jdcd-project");
const cfg = { projectId };
if (logType) cfg.logType = logType;

fs.writeFileSync(target, JSON.stringify(cfg, null, 2) + "\n");
console.log(`Wrote ${target}`);
console.log(JSON.stringify(cfg, null, 2));
