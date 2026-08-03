import { existsSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';

const huskyDir = join(process.cwd(), '.husky');
if (!existsSync(huskyDir)) {
  mkdirSync(huskyDir, { recursive: true });
}

// Husky 9: no legacy husky.sh sourcing. Keep in sync with .husky/pre-commit.
const preCommit = `# Husky v9+: no legacy husky.sh sourcing.
# GUI clients (GitHub Desktop) often use a minimal PATH without Node toolchain bins.
for candidate in /usr/local/bin /opt/homebrew/bin; do
  case ":$PATH:" in
    *":$candidate:"*) ;;
    *)
      if [ -d "$candidate" ]; then
        PATH="$candidate:$PATH"
      fi
      ;;
  esac
done
export PATH

status=0
if command -v pnpm >/dev/null 2>&1; then
  pnpm exec lint-staged || status=$?
elif command -v corepack >/dev/null 2>&1; then
  corepack pnpm exec lint-staged || status=$?
else
  echo "husky pre-commit: pnpm was not found on PATH." >&2
  echo "Install pnpm or enable Corepack (Node 22+: corepack enable), then retry." >&2
  echo "GitHub Desktop and other GUI Git clients may not inherit shell PATH customizations." >&2
  exit 127
fi

if [ "$status" -ne 0 ]; then
  if git diff --cached --quiet 2>/dev/null; then
    echo "husky pre-commit: nothing to commit — staged changes were empty or reverted by formatters." >&2
    echo "Make a real source change (or stage regenerated OpenAPI/docs that differ from HEAD), then retry." >&2
  fi
  exit "$status"
fi
`;

writeFileSync(join(huskyDir, 'pre-commit'), preCommit, { mode: 0o755 });
chmodSync(join(huskyDir, 'pre-commit'), 0o755);

try {
  const { execSync } = await import('node:child_process');
  execSync('npx --yes husky@9.1.7', { stdio: 'ignore' });
} catch {
  // Husky init is best-effort during prepare; CI does not require a local hook install.
}

console.log('Husky pre-commit hook configured.');
