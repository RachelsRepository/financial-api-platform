import { type ClientApplication } from '../../domain/entities';

export interface ClientRepository {
  findById(id: string): Promise<ClientApplication | null>;
  findByClientId(clientId: string): Promise<ClientApplication | null>;
}
