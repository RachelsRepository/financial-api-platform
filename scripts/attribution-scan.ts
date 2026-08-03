import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();

const SCAN_DIRS = ['src', 'test', 'scripts', 'docs'];

const EXCLUDED_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', 'openapi']);

const EXCLUDED_FILE_PATTERN = /(?:pnpm-lock\.yaml|package-lock\.json|yarn\.lock|\.min\.js$|\.map$)/;

const ATTRIBUTION_PATTERN =
  /(?:Cursor|cursoragent|Claude|ChatGPT|Copilot|AI-generated|generated-by|built-with|co-author)/i;

const TEXT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.yml',
  '.yaml',
  '.tf',
  '.hcl',
  '.sh',
  '.env.example',
]);

function listFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const rel = relative(ROOT, fullPath);

    if (EXCLUDED_DIRS.has(entry)) {
      continue;
    }

    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...listFiles(fullPath));
      continue;
    }

    if (EXCLUDED_FILE_PATTERN.test(rel)) {
      continue;
    }

    const ext = entry.includes('.') ? `.${entry.split('.').pop()}` : '';
    if (TEXT_EXTENSIONS.has(ext) || entry === 'Dockerfile' || entry === 'Makefile') {
      files.push(fullPath);
    }
  }

  return files;
}

function isGitTracked(filePath: string): boolean {
  try {
    execSync(`git ls-files --error-unmatch "${relative(ROOT, filePath)}"`, {
      cwd: ROOT,
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
}

function main(): void {
  const hits: Array<{ file: string; line: number; text: string }> = [];

  for (const scanDir of SCAN_DIRS) {
    const absolute = join(ROOT, scanDir);
    try {
      statSync(absolute);
    } catch {
      continue;
    }

    for (const file of listFiles(absolute)) {
      const rel = relative(ROOT, file);
      if (!isGitTracked(file)) {
        continue;
      }

      const content = readFileSync(file, 'utf8');
      const lines = content.split('\n');

      lines.forEach((line, index) => {
        if (ATTRIBUTION_PATTERN.test(line)) {
          hits.push({ file: rel, line: index + 1, text: line.trim() });
        }
      });
    }
  }

  if (hits.length > 0) {
    console.error('Attribution scan failed. Remove AI tool attribution from tracked files:');
    for (const hit of hits) {
      console.error(`  ${hit.file}:${hit.line}: ${hit.text}`);
    }
    process.exit(1);
  }

  console.log('Attribution scan passed.');
}

main();
