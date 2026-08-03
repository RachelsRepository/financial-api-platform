import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import cruise from 'dependency-cruiser';

const ROOT = join(process.cwd(), 'src');
const FORBIDDEN_DOMAIN_IMPORTS = [
  '@nestjs',
  '@prisma',
  'kafkajs',
  'ioredis',
  'fastify',
  '@fastify',
  'src/infrastructure',
  'src/interfaces',
  'src/observability',
  'src/config',
];

function collectTsFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...collectTsFiles(fullPath));
      continue;
    }
    if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('Architecture boundaries', () => {
  it('domain layer does not import frameworks or outer layers', () => {
    const domainDir = join(ROOT, 'domain');
    const domainFiles = collectTsFiles(domainDir);

    for (const file of domainFiles) {
      const content = readFileSync(file, 'utf8');
      for (const forbidden of FORBIDDEN_DOMAIN_IMPORTS) {
        expect(
          content,
          `${relative(process.cwd(), file)} must not import ${forbidden}`,
        ).not.toMatch(new RegExp(`from ['"]${forbidden.replace('/', '\\/')}`));
      }
    }
  });

  it('passes dependency-cruiser forbidden rules', async () => {
    const result = await cruise.cruise(['src'], {
      ruleSet: require('../../.dependency-cruiser.cjs'),
      tsPreCompilationDeps: true,
      tsConfig: { fileName: 'tsconfig.json' },
    });

    if (typeof result.output === 'string') {
      throw new Error(`dependency-cruiser returned unexpected string output: ${result.output}`);
    }

    expect(result.output.summary.error).toBe(0);
  });
});
