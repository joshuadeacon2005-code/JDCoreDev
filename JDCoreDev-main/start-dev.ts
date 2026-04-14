import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectDir = join(__dirname, 'JDCoreDev-main');

// Load .env
const envContent = readFileSync(join(projectDir, '.env'), 'utf-8');
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex > 0) {
      process.env[trimmed.slice(0, eqIndex)] = trimmed.slice(eqIndex + 1);
    }
  }
}

process.chdir(projectDir);
import('./JDCoreDev-main/server/index.ts');
