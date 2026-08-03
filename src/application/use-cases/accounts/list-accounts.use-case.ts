import { AuthorizationError } from '../../../domain/errors';
import { SCOPES } from '../../../domain/value-objects';
import { type ListAccountsCommand, type ListAccountsResult } from '../../dto/account.dto';
import { toAccountSummary } from '../../mappers';
import { type AccountRepository } from '../../ports/account.repository';
import { type ConsentRepository } from '../../ports/consent.repository';
import { type AuthorizationDecisionService } from '../../services/authorization-decision.service';

export class ListAccountsUseCase {
  constructor(
    private readonly consentRepository: ConsentRepository,
    private readonly accountRepository: AccountRepository,
    private readonly authorizationDecision: AuthorizationDecisionService,
  ) {}

  async execute(command: ListAccountsCommand): Promise<ListAccountsResult> {
    const consent = await this.consentRepository.findById(command.consentId);
    if (consent === null) {
      throw new AuthorizationError(`Consent ${command.consentId} not found`, 'not_found');
    }

    await this.authorizationDecision.requireAccountAccess({
      claims: command.claims,
      consent,
      requiredScope: SCOPES.ACCOUNTS_READ,
    });

    const accounts = await this.accountRepository.findByUserAndInstitution(
      consent.userId,
      consent.institutionId,
    );

    const authorized = accounts.filter((account) => consent.authorizedAccountIds.has(account.id));

    return { accounts: authorized.map(toAccountSummary) };
  }
}
