import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = process.cwd();
const roots = ['plugin', 'tests/node'];
const extensions = new Set(['.js', '.mjs']);

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collect(fullPath));
    else if (extensions.has(path.extname(entry.name))) files.push(fullPath);
  }
  return files;
}

function check(file) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--check', file], { stdio: 'inherit', windowsHide: true });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`syntax check failed: ${file} (${signal ?? code})`));
    });
  });
}

const files = (await Promise.all(roots.map((entry) => collect(path.join(root, entry))))).flat().sort();
for (const file of files) await check(file);
console.log(`Syntax check passed for ${files.length} JavaScript files.`);
