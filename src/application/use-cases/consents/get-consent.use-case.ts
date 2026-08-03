import { AuthorizationError } from '../../../domain/errors';
import { type GetConsentCommand, type GetConsentResult } from '../../dto/consent.dto';
import { toConsentSummary } from '../../mappers';
import { type ClientRepository } from '../../ports/client.repository';
import { type ConsentRepository } from '../../ports/consent.repository';

export class GetConsentUseCase {
  constructor(
    private readonly consentRepository: ConsentRepository,
    private readonly clientRepository: ClientRepository,
  ) {}

  async execute(command: GetConsentCommand): Promise<GetConsentResult> {
    const consent = await this.consentRepository.findById(command.consentId);
    if (consent === null) {
      throw new AuthorizationError(`Consent ${command.consentId} not found`, 'not_found');
    }

    const client = await this.clientRepository.findById(consent.clientId);
    if (client === null || client.clientId !== command.actorClientId) {
      throw new AuthorizationError('Client cannot access this consent', 'forbidden');
    }

    return { consent: toConsentSummary(consent) };
  }
}
