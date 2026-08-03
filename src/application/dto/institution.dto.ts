import { type InstitutionSummaryDto } from './common.dto';

export interface ListInstitutionsCommand {
  country?: string;
}

export interface ListInstitutionsResult {
  institutions: InstitutionSummaryDto[];
}
