import {
  type ListInstitutionsCommand,
  type ListInstitutionsResult,
} from '../../dto/institution.dto';
import { toInstitutionSummary } from '../../mappers';
import { type InstitutionRepository } from '../../ports/institution.repository';

export class ListInstitutionsUseCase {
  constructor(private readonly institutionRepository: InstitutionRepository) {}

  async execute(command: ListInstitutionsCommand): Promise<ListInstitutionsResult> {
    const institutions = await this.institutionRepository.listActive();

    const filtered =
      command.country !== undefined
        ? institutions.filter((institution) => institution.country === command.country)
        : institutions;

    return {
      institutions: filtered.map(toInstitutionSummary),
    };
  }
}
