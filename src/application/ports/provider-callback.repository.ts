/** Durable provider callback / webhook receipt tracking for replay protection. */

export interface ProviderCallbackRecord {
  id: string;
  providerCode: string;
  providerEventId: string;
  paymentId: string | null;
  payloadHash: string;
  signatureValid: boolean;
  processedAt: Date | null;
  createdAt: Date;
}

export interface ProviderCallbackRepository {
  findByProviderEvent(
    providerCode: string,
    providerEventId: string,
  ): Promise<ProviderCallbackRecord | null>;
  save(record: ProviderCallbackRecord): Promise<void>;
  markProcessed(id: string, processedAt: Date, paymentId: string | null): Promise<void>;
}
