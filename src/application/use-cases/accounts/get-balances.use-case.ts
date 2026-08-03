import { AuthorizationError } from '../../../domain/errors';
import { SCOPES } from '../../../domain/value-objects';
import { type GetBalancesCommand, type GetBalancesResult } from '../../dto/account.dto';
import { type AccountRepository } from '../../ports/account.repository';
import { type ConsentRepository } from '../../ports/consent.repository';
import { type AuthorizationDecisionService } from '../../services/authorization-decision.service';

export class GetBalancesUseCase {
  constructor(
    private readonly consentRepository: ConsentRepository,
    private readonly accountRepository: AccountRepository,
    private readonly authorizationDecision: AuthorizationDecisionService,
  ) {}

  async execute(command: GetBalancesCommand): Promise<GetBalancesResult> {
    const consent = await this.consentRepository.findById(command.consentId);
    if (consent === null) {
      throw new AuthorizationError(`Consent ${command.consentId} not found`, 'not_found');
    }

    await this.authorizationDecision.requireAccountAccess({
      claims: command.claims,
      consent,
      requiredScope: SCOPES.BALANCES_READ,
      accountId: command.accountId,
    });

    const balances = await this.accountRepository.getBalances(command.accountId);

    return {
      balances: balances.map((balance) => ({
        accountId: balance.accountId,
        currency: balance.currency,
        availableMinor: balance.availableMinor,
        currentMinor: balance.currentMinor,
        asOf: balance.asOf,
      })),
    };
  }
}
