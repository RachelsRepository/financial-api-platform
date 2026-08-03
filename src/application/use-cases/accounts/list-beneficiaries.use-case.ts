import { AuthorizationError } from '../../../domain/errors';
import { SCOPES } from '../../../domain/value-objects';
import { type ListBeneficiariesCommand, type ListBeneficiariesResult } from '../../dto/account.dto';
import { type AccountRepository } from '../../ports/account.repository';
import { type ConsentRepository } from '../../ports/consent.repository';
import { type AuthorizationDecisionService } from '../../services/authorization-decision.service';

export class ListBeneficiariesUseCase {
  constructor(
    private readonly consentRepository: ConsentRepository,
    private readonly accountRepository: AccountRepository,
    private readonly authorizationDecision: AuthorizationDecisionService,
  ) {}

  async execute(command: ListBeneficiariesCommand): Promise<ListBeneficiariesResult> {
    const consent = await this.consentRepository.findById(command.consentId);
    if (consent === null) {
      throw new AuthorizationError(`Consent ${command.consentId} not found`, 'not_found');
    }

    await this.authorizationDecision.requireAccountAccess({
      claims: command.claims,
      consent,
      requiredScope: SCOPES.BENEFICIARIES_READ,
      accountId: command.accountId,
    });

    const beneficiaries = await this.accountRepository.listBeneficiaries(command.accountId);

    return {
      beneficiaries: beneficiaries.map((beneficiary) => ({
        id: beneficiary.id,
        accountId: beneficiary.accountId,
        name: beneficiary.name,
        accountRef: beneficiary.accountRef,
        bankCode: beneficiary.bankCode,
      })),
    };
  }
}
