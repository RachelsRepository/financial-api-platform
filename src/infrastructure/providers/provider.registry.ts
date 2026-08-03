import type { FinancialProvider } from '@infrastructure/providers/provider.port';
import { CobaltProvider } from '@infrastructure/providers/cobalt/cobalt.provider';
import { MeridianProvider } from '@infrastructure/providers/meridian/meridian.provider';
import { NorthstarProvider } from '@infrastructure/providers/northstar/northstar.provider';
import { SandboxProvider } from '@infrastructure/providers/sandbox/sandbox.provider';

export class ProviderNotFoundError extends Error {
  constructor(code: string) {
    super(`Financial provider not registered: ${code}`);
    this.name = 'ProviderNotFoundError';
  }
}

export interface ProviderRegistryConfig {
  readonly northstar?: ConstructorParameters<typeof NorthstarProvider>[0];
  readonly meridian?: ConstructorParameters<typeof MeridianProvider>[0];
  readonly cobalt?: ConstructorParameters<typeof CobaltProvider>[0];
  readonly enableSandbox?: boolean;
}

export class ProviderRegistry {
  private readonly providers = new Map<string, FinancialProvider>();

  constructor(config: ProviderRegistryConfig = {}) {
    if (config.northstar) {
      this.register(new NorthstarProvider(config.northstar));
    }
    if (config.meridian) {
      this.register(new MeridianProvider(config.meridian));
    }
    if (config.cobalt) {
      this.register(new CobaltProvider(config.cobalt));
    }
    if (config.enableSandbox) {
      this.register(new SandboxProvider());
    }
  }

  register(provider: FinancialProvider): void {
    this.providers.set(provider.code, provider);
  }

  resolve(code: string): FinancialProvider {
    const provider = this.providers.get(code);
    if (!provider) {
      throw new ProviderNotFoundError(code);
    }
    return provider;
  }

  has(code: string): boolean {
    return this.providers.has(code);
  }

  listCodes(): string[] {
    return [...this.providers.keys()].sort();
  }
}

export function createDefaultProviderRegistry(
  config: ProviderRegistryConfig = {},
): ProviderRegistry {
  return new ProviderRegistry({
    ...config,
    enableSandbox: config.enableSandbox ?? true,
  });
}
