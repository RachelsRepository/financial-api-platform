import { type Institution } from '../../domain/entities';

export interface InstitutionRepository {
  findById(id: string): Promise<Institution | null>;
  findByCode(code: string): Promise<Institution | null>;
  listActive(): Promise<Institution[]>;
}
