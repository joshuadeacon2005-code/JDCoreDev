/**
 * Finds the Express static folder automatically.
 * Checks common locations and reads the main server file if needed.
 * 
 * Run this standalone to verify: node pipeline/find-static.js
 */

import fs from 'fs';
import path from 'path';

// Common static folder names to check (in order of likelihood)
const CANDIDATES = ['public', 'static', 'dist', 'build', 'www', 'client/build', 'client/dist'];

// Root of the Replit project (one level up from /pipeline)
const PROJECT_ROOT = path.resolve(process.cwd());

export async function findStaticFolder() {
  // 1. Check env override first (set STATIC_FOLDER in Replit Secrets if needed)
  if (process.env.STATIC_FOLDER) {
    const override = path.join(PROJECT_ROOT, process.env.STATIC_FOLDER);
    if (fs.existsSync(override)) {
      return override;
    }
  }

  // 2. Check common folder names
  for (const candidate of CANDIDATES) {
    const full = path.join(PROJECT_ROOT, candidate);
    if (fs.existsSync(full) && fs.statSync(full).isDirectory()) {
      console.log(`[find-static] Found static folder: ${candidate}/`);
      return full;
    }
  }

  // 3. Try to parse the main server file for express.static()
  const serverFiles = ['index.js', 'server.js', 'app.js', 'main.js'];
  for (const file of serverFiles) {
    const full = path.join(PROJECT_ROOT, file);
    if (!fs.existsSync(full)) continue;

    const content = fs.readFileSync(full, 'utf-8');
    const match = content.match(/express\.static\(['"]([^'"]+)['"]\)/);
    if (match) {
      const found = path.join(PROJECT_ROOT, match[1]);
      if (fs.existsSync(found)) {
        console.log(`[find-static] Detected static folder from ${file}: ${match[1]}/`);
        return found;
      }
    }
  }

  // 4. Fallback: create /public and log a warning
  const fallback = path.join(PROJECT_ROOT, 'public');
  console.warn(`[find-static] ⚠️  Could not detect static folder. Creating /public as fallback.`);
  console.warn(`[find-static] If this is wrong, set STATIC_FOLDER in your Replit Secrets.`);
  fs.mkdirSync(fallback, { recursive: true });
  return fallback;
}

// ── Standalone test ────────────────────────────────────────────────────────
// Run: node pipeline/find-static.js
if (process.argv[1].includes('find-static')) {
  findStaticFolder().then(folder => {
    console.log(`\n✅ Static folder resolved to:\n   ${folder}`);
    console.log(`\n   Audit pages will be written to:\n   ${folder}/audits/[company-slug]/index.html`);
    console.log(`\n   And served at:\n   https://jdcoredev.com/audits/[company-slug]`);
  });
}
