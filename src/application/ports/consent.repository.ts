import { type Consent } from '../../domain/entities';

export interface ConsentRepository {
  findById(id: string): Promise<Consent | null>;
  save(consent: Consent): Promise<void>;
  findExpirable(before: Date, limit: number): Promise<Consent[]>;
}
