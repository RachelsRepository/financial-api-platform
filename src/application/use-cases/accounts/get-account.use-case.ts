import { AuthorizationError } from '../../../domain/errors';
import { SCOPES } from '../../../domain/value-objects';
import { type GetAccountCommand, type GetAccountResult } from '../../dto/account.dto';
import { toAccountSummary } from '../../mappers';
import { type AccountRepository } from '../../ports/account.repository';
import { type ConsentRepository } from '../../ports/consent.repository';
import { type AuthorizationDecisionService } from '../../services/authorization-decision.service';

export class GetAccountUseCase {
  constructor(
    private readonly consentRepository: ConsentRepository,
    private readonly accountRepository: AccountRepository,
    private readonly authorizationDecision: AuthorizationDecisionService,
  ) {}

  async execute(command: GetAccountCommand): Promise<GetAccountResult> {
    const consent = await this.consentRepository.findById(command.consentId);
    if (consent === null) {
      throw new AuthorizationError(`Consent ${command.consentId} not found`, 'not_found');
    }

    await this.authorizationDecision.requireAccountAccess({
      claims: command.claims,
      consent,
      requiredScope: SCOPES.ACCOUNTS_READ,
      accountId: command.accountId,
    });

    const account = await this.accountRepository.findById(command.accountId);
    if (account === null) {
      throw new AuthorizationError(`Account ${command.accountId} not found`, 'not_found');
    }

    return { account: toAccountSummary(account) };
  }
}
