import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();

const SCAN_DIRS = ['src', 'test', 'scripts', 'docs'];

const EXCLUDED_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', 'openapi']);

const EXCLUDED_FILE_PATTERN = /(?:pnpm-lock\.yaml|package-lock\.json|yarn\.lock|\.min\.js$|\.map$)/;

/**
 * Explicit AI-tool attribution / provenance metadata only.
 *
 * Do NOT match bare product names or ordinary engineering terms such as
 * pagination `cursor`, `nextCursor`, `encodeCursor`, or "Opaque pagination cursor".
 *
 * Sensitive literals are assembled so this file does not match itself.
 */
const CURSOR = 'cursor';
const AGENT = 'agent';
const CLAUDE = 'claude';
const CHATGPT = 'chatgpt';
const COPILOT = 'copilot';

export const ATTRIBUTION_PATTERNS: readonly RegExp[] = [
  // Cursor — require attribution context; never bare "cursor"
  new RegExp(String.raw`\b${CURSOR}\s+(?:ai|${AGENT})\b`, 'i'),
  new RegExp(String.raw`\b(?:generated|built|created|written)\s+(?:by|with)\s+${CURSOR}\b`, 'i'),
  new RegExp(String.raw`\b${CURSOR}${AGENT}\b`, 'i'),

  // Claude / ChatGPT / Copilot — attribution phrasing or co-author trailers
  new RegExp(
    String.raw`\b(?:generated|built|created|written)\s+(?:by|with)\s+(?:${CLAUDE}|${CHATGPT}|${COPILOT}|github\s+${COPILOT})\b`,
    'i',
  ),
  new RegExp(
    String.raw`\bco-authored-by:\s*(?:${CLAUDE}|${CHATGPT}|${COPILOT}|github\s+${COPILOT}|${CURSOR}(?:\s+ai)?)\b`,
    'i',
  ),

  // Generic metadata markers (ai + generated, generated + by, built + with)
  new RegExp(String.raw`\bai-` + String.raw`generated\b`, 'i'),
  new RegExp(String.raw`\bgenerated` + String.raw`-by\b`, 'i'),
  new RegExp(String.raw`\bbuilt` + String.raw`-with\b`, 'i'),
];

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

export interface AttributionHit {
  line: number;
  text: string;
}

/** Return true when a single line contains explicit AI-tool attribution. */
export function lineHasAttribution(line: string): boolean {
  return ATTRIBUTION_PATTERNS.some((pattern) => pattern.test(line));
}

/** Scan multi-line text; return hits with 1-based line numbers (deterministic order). */
export function findAttributionHits(content: string): AttributionHit[] {
  const hits: AttributionHit[] = [];
  const lines = content.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (lineHasAttribution(line)) {
      hits.push({ line: index + 1, text: line.trim() });
    }
  }
  return hits;
}

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
      for (const hit of findAttributionHits(content)) {
        hits.push({ file: rel, ...hit });
      }
    }
  }

  hits.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

  if (hits.length > 0) {
    console.error('Attribution scan failed. Remove AI tool attribution from tracked files:');
    for (const hit of hits) {
      console.error(`  ${hit.file}:${hit.line}: ${hit.text}`);
    }
    process.exit(1);
  }

  console.log('Attribution scan passed.');
}

const isDirectRun =
  typeof process.argv[1] === 'string' &&
  /attribution-scan\.(ts|js|mjs|cjs)$/.test(process.argv[1].replaceAll('\\', '/'));

if (isDirectRun) {
  main();
}
