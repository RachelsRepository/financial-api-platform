import { AuthorizationError } from '../../../domain/errors';
import { SCOPES } from '../../../domain/value-objects';
import { type ListTransactionsCommand, type ListTransactionsResult } from '../../dto/account.dto';
import { type AccountRepository } from '../../ports/account.repository';
import { type ConsentRepository } from '../../ports/consent.repository';
import { type AuthorizationDecisionService } from '../../services/authorization-decision.service';

export class ListTransactionsUseCase {
  constructor(
    private readonly consentRepository: ConsentRepository,
    private readonly accountRepository: AccountRepository,
    private readonly authorizationDecision: AuthorizationDecisionService,
  ) {}

  async execute(command: ListTransactionsCommand): Promise<ListTransactionsResult> {
    const consent = await this.consentRepository.findById(command.consentId);
    if (consent === null) {
      throw new AuthorizationError(`Consent ${command.consentId} not found`, 'not_found');
    }

    await this.authorizationDecision.requireAccountAccess({
      claims: command.claims,
      consent,
      requiredScope: SCOPES.TRANSACTIONS_READ,
      accountId: command.accountId,
    });

    const page = await this.accountRepository.listTransactions(command.accountId, {
      limit: command.limit,
      ...(command.cursor !== undefined ? { cursor: command.cursor } : {}),
    });

    return {
      transactions: page.items.map((tx) => ({
        id: tx.id,
        accountId: tx.accountId,
        amountMinor: tx.amountMinor,
        currency: tx.currency,
        direction: tx.direction,
        description: tx.description,
        bookedAt: tx.bookedAt,
      })),
      nextCursor: page.nextCursor,
    };
  }
}
