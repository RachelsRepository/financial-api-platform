import { execSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const committedPath = join(process.cwd(), 'openapi', 'openapi.json');

function sortOpenApiKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortOpenApiKeys);
  }
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortOpenApiKeys((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

function normalizeOpenApi(content: string): string {
  const parsed = JSON.parse(content) as unknown;
  return `${JSON.stringify(sortOpenApiKeys(parsed), null, 2)}\n`;
}

function main(): void {
  let baseline: string;
  try {
    // Snapshot before generation overwrites the working-tree artifact.
    baseline = readFileSync(committedPath, 'utf8');
  } catch {
    console.error(
      `Committed OpenAPI spec not found at ${committedPath}. Run pnpm openapi:generate and commit the result.`,
    );
    process.exit(1);
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'openapi-check-'));

  try {
    execSync('pnpm build', {
      stdio: 'inherit',
      env: process.env,
    });
    execSync('pnpm exec tsx scripts/generate-openapi.ts', {
      stdio: 'inherit',
      env: process.env,
    });

    const generated = readFileSync(committedPath, 'utf8');

    const normalizedGenerated = normalizeOpenApi(generated);
    const normalizedBaseline = normalizeOpenApi(baseline);

    if (normalizedGenerated !== normalizedBaseline) {
      console.error(
        'OpenAPI spec is out of date. Run `pnpm openapi:generate` and commit openapi/openapi.json.',
      );
      process.exit(1);
    }

    console.log('OpenAPI spec matches committed document.');
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

main();
