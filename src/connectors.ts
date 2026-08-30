import type { ProviderRuntimeConfig, ProviderSnapshot } from "./types.ts";

/**
 * Provider implementations own their official account, billing, and quota API
 * quirks. Inference protocol compatibility is not used to infer quota support.
 */
export interface ProviderConnector {
  readonly providerId: string;
  fetchSnapshot(provider: ProviderRuntimeConfig): Promise<ProviderSnapshot>;
}

export class ConnectorRegistry {
  private readonly connectors = new Map<string, ProviderConnector>();

  constructor(connectors: ProviderConnector[] = []) {
    for (const connector of connectors) {
      this.connectors.set(connector.providerId, connector);
    }
  }

  async snapshotFor(
    provider: ProviderRuntimeConfig,
  ): Promise<ProviderSnapshot> {
    const connector = this.connectors.get(provider.id);
    if (!connector) {
      return {
        providerId: provider.id,
        observedAt: new Date().toISOString(),
        connection: "unsupported",
        quotas: [],
        warnings: [
          "No account API connector is implemented for this provider yet.",
        ],
      };
    }

    return connector.fetchSnapshot(provider);
  }
}
