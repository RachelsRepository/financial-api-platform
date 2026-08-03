import { type Payment } from '../../domain/entities';

export interface PaymentRepository {
  findById(id: string): Promise<Payment | null>;
  findByProviderPaymentId(providerPaymentId: string): Promise<Payment | null>;
  findByIdempotencyKey(clientId: string, idempotencyKey: string): Promise<Payment | null>;
  findSubmitted(limit: number): Promise<Payment[]>;
  save(payment: Payment): Promise<void>;
}
