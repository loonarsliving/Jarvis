import type { RenderProvider } from "./types.js";

/**
 * A minimal name -> provider registry (Constitution Article VIII: "the
 * general `render-provider` interface + provider registry" is Agent 4's
 * deliverable). Not over-engineered — v1 only ever registers one provider
 * (Higgsfield), but calling code (mission-dispatcher, the poller) resolves
 * providers through this registry rather than importing the Higgsfield
 * module directly, so a second provider (FSD §14.6) is a registration line,
 * not a call-site change.
 */
export class RenderProviderRegistry {
  private readonly providers = new Map<string, RenderProvider>();

  register(provider: RenderProvider): void {
    if (this.providers.has(provider.name)) {
      throw new Error(`Render provider "${provider.name}" is already registered`);
    }
    this.providers.set(provider.name, provider);
  }

  get(name: string): RenderProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(
        `No render provider registered under "${name}". Registered: ${[...this.providers.keys()].join(", ") || "(none)"}`,
      );
    }
    return provider;
  }

  has(name: string): boolean {
    return this.providers.has(name);
  }
}

/**
 * Process-wide default registry. Each service's entrypoint registers the
 * providers it needs at startup (currently just Higgsfield, via
 * `createHiggsfieldProvider` + `.register(...)`) — this module never
 * registers a provider itself, keeping it free of any provider-specific
 * dependency (Constitution Article II.3).
 */
export const defaultRenderProviderRegistry = new RenderProviderRegistry();
