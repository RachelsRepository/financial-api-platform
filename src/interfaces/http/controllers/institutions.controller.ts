import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ListInstitutionsUseCase } from '../../../application/use-cases/institutions/list-institutions.use-case';
import { ListInstitutionsQueryDto } from '../dto/account.request.dto';

@ApiTags('Institutions')
@Controller('api/v1/institutions')
export class InstitutionsController {
  constructor(private readonly listInstitutions: ListInstitutionsUseCase) {}

  @Get()
  @ApiOperation({ summary: 'List active financial institutions' })
  async list(@Query() query: ListInstitutionsQueryDto) {
    const result = await this.listInstitutions.execute({
      country: query.country,
    });
    return result;
  }
}
