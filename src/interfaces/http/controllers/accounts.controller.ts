import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GetAccountUseCase } from '../../../application/use-cases/accounts/get-account.use-case';
import { GetBalancesUseCase } from '../../../application/use-cases/accounts/get-balances.use-case';
import { ListAccountsUseCase } from '../../../application/use-cases/accounts/list-accounts.use-case';
import { ListBeneficiariesUseCase } from '../../../application/use-cases/accounts/list-beneficiaries.use-case';
import { ListTransactionsUseCase } from '../../../application/use-cases/accounts/list-transactions.use-case';
import { SCOPES } from '../../../domain/value-objects';
import {
  accountRequestDurationSeconds,
  accountRequestsTotal,
} from '../../../observability/metrics';
import { CurrentAuth, RequireScopes, type AuthContext } from '../decorators/current-auth.decorator';
import { ListTransactionsQueryDto } from '../dto/account.request.dto';
import { BearerAuthGuard } from '../guards/bearer-auth.guard';
import { ScopesGuard } from '../guards/scopes.guard';

@ApiTags('Accounts')
@ApiBearerAuth()
@UseGuards(BearerAuthGuard, ScopesGuard)
@Controller('api/v1/accounts')
export class AccountsController {
  constructor(
    private readonly listAccounts: ListAccountsUseCase,
    private readonly getAccount: GetAccountUseCase,
    private readonly getBalances: GetBalancesUseCase,
    private readonly listTransactions: ListTransactionsUseCase,
    private readonly listBeneficiaries: ListBeneficiariesUseCase,
  ) {}

  @Get()
  @RequireScopes(SCOPES.ACCOUNTS_READ)
  @ApiOperation({ summary: 'List authorized accounts' })
  async list(@CurrentAuth() auth: AuthContext) {
    return this.timed('list', () =>
      this.listAccounts.execute({
        claims: auth.claims,
        consentId: auth.consentId,
      }),
    );
  }

  @Get(':accountId')
  @RequireScopes(SCOPES.ACCOUNTS_READ)
  @ApiOperation({ summary: 'Get account details' })
  async getOne(
    @CurrentAuth() auth: AuthContext,
    @Param('accountId', ParseUUIDPipe) accountId: string,
  ) {
    return this.timed('get', () =>
      this.getAccount.execute({
        claims: auth.claims,
        consentId: auth.consentId,
        accountId,
      }),
    );
  }

  @Get(':accountId/balances')
  @RequireScopes(SCOPES.BALANCES_READ)
  @ApiOperation({ summary: 'Get account balances' })
  async balances(
    @CurrentAuth() auth: AuthContext,
    @Param('accountId', ParseUUIDPipe) accountId: string,
  ) {
    return this.timed('balances', () =>
      this.getBalances.execute({
        claims: auth.claims,
        consentId: auth.consentId,
        accountId,
      }),
    );
  }

  @Get(':accountId/transactions')
  @RequireScopes(SCOPES.TRANSACTIONS_READ)
  @ApiOperation({ summary: 'List account transactions' })
  async transactions(
    @CurrentAuth() auth: AuthContext,
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Query() query: ListTransactionsQueryDto,
  ) {
    return this.timed('transactions', () =>
      this.listTransactions.execute({
        claims: auth.claims,
        consentId: auth.consentId,
        accountId,
        cursor: query.cursor,
        limit: query.limit ?? 25,
      }),
    );
  }

  @Get(':accountId/beneficiaries')
  @RequireScopes(SCOPES.BENEFICIARIES_READ)
  @ApiOperation({ summary: 'List account beneficiaries' })
  async beneficiaries(
    @CurrentAuth() auth: AuthContext,
    @Param('accountId', ParseUUIDPipe) accountId: string,
  ) {
    return this.timed('beneficiaries', () =>
      this.listBeneficiaries.execute({
        claims: auth.claims,
        consentId: auth.consentId,
        accountId,
      }),
    );
  }

  private async timed<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    const end = accountRequestDurationSeconds.startTimer({ operation });
    accountRequestsTotal.inc({ operation });
    try {
      return await fn();
    } finally {
      end();
    }
  }
}
