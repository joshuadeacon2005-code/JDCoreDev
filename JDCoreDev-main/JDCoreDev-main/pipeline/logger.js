import fs from 'fs';
import path from 'path';

const LOG_FILE = path.resolve(process.cwd(), 'pipeline/data/run.log');

export function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch {}
}
