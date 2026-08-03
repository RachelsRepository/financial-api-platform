import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { AuthorizePaymentUseCase } from '../../../application/use-cases/payments/authorize-payment.use-case';
import { CancelPaymentUseCase } from '../../../application/use-cases/payments/cancel-payment.use-case';
import { CreatePaymentUseCase } from '../../../application/use-cases/payments/create-payment.use-case';
import { GetPaymentUseCase } from '../../../application/use-cases/payments/get-payment.use-case';
import { SubmitPaymentUseCase } from '../../../application/use-cases/payments/submit-payment.use-case';
import { SCOPES } from '../../../domain/value-objects';
import { paymentDurationSeconds, paymentsCreatedTotal } from '../../../observability/metrics';
import { IDEMPOTENCY_KEY_HEADER } from '../constants';
import { CurrentAuth, RequireScopes, type AuthContext } from '../decorators/current-auth.decorator';
import {
  AuthorizePaymentRequestDto,
  CancelPaymentRequestDto,
  CreatePaymentRequestDto,
  SubmitPaymentRequestDto,
} from '../dto/payment.request.dto';
import { BearerAuthGuard } from '../guards/bearer-auth.guard';
import { ScopesGuard } from '../guards/scopes.guard';
import { getCorrelationId } from '../middleware/correlation-id.middleware';

@ApiTags('Payments')
@ApiBearerAuth()
@UseGuards(BearerAuthGuard, ScopesGuard)
@Controller('api/v1/payments')
export class PaymentsController {
  constructor(
    private readonly createPayment: CreatePaymentUseCase,
    private readonly authorizePayment: AuthorizePaymentUseCase,
    private readonly submitPayment: SubmitPaymentUseCase,
    private readonly getPayment: GetPaymentUseCase,
    private readonly cancelPayment: CancelPaymentUseCase,
  ) {}

  @Post()
  @RequireScopes(SCOPES.PAYMENTS_WRITE)
  @ApiOperation({ summary: 'Create a payment' })
  @ApiHeader({
    name: 'X-Idempotency-Key',
    required: false,
    description: 'Unique key for idempotent payment creation',
  })
  async create(
    @CurrentAuth() auth: AuthContext,
    @Body() body: CreatePaymentRequestDto,
    @Headers(IDEMPOTENCY_KEY_HEADER) idempotencyKey: string | undefined,
    @Req() request: FastifyRequest,
  ) {
    return this.timed('create', async () => {
      const result = await this.createPayment.execute({
        claims: auth.claims,
        consentId: auth.consentId,
        sourceAccountId: body.sourceAccountId,
        amountMinor: body.amountMinor,
        currency: body.currency,
        creditorName: body.creditorName,
        creditorAccountRef: body.creditorAccountRef,
        reference: body.reference,
        idempotencyKey,
        correlationId: getCorrelationId(request),
      });
      paymentsCreatedTotal.inc();
      return result;
    });
  }

  @Post(':paymentId/authorize')
  @RequireScopes(SCOPES.PAYMENTS_WRITE)
  @ApiOperation({ summary: 'Authorize a payment for submission' })
  async authorize(
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() body: AuthorizePaymentRequestDto,
    @Req() request: FastifyRequest,
  ) {
    return this.timed('authorize', () =>
      this.authorizePayment.execute({
        paymentId,
        actorUserId: body.actorUserId,
        correlationId: getCorrelationId(request),
      }),
    );
  }

  @Post(':paymentId/submit')
  @RequireScopes(SCOPES.PAYMENTS_WRITE)
  @ApiOperation({ summary: 'Submit an authorized payment to the provider' })
  async submit(
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() body: SubmitPaymentRequestDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: FastifyRequest,
  ) {
    return this.timed('submit', () =>
      this.submitPayment.execute({
        paymentId,
        actorClientId: body.actorClientId ?? auth.claims.clientId,
        correlationId: getCorrelationId(request),
      }),
    );
  }

  @Get(':paymentId')
  @RequireScopes(SCOPES.PAYMENTS_READ)
  @ApiOperation({ summary: 'Get payment details' })
  async get(
    @CurrentAuth() auth: AuthContext,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
  ) {
    return this.timed('get', () =>
      this.getPayment.execute({
        claims: auth.claims,
        consentId: auth.consentId,
        paymentId,
      }),
    );
  }

  @Post(':paymentId/cancel')
  @RequireScopes(SCOPES.PAYMENTS_WRITE)
  @ApiOperation({ summary: 'Cancel a payment' })
  async cancel(
    @CurrentAuth() auth: AuthContext,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() _body: CancelPaymentRequestDto,
    @Req() request: FastifyRequest,
  ) {
    return this.timed('cancel', () =>
      this.cancelPayment.execute({
        claims: auth.claims,
        consentId: auth.consentId,
        paymentId,
        correlationId: getCorrelationId(request),
      }),
    );
  }

  private async timed<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    const end = paymentDurationSeconds.startTimer({ operation });
    try {
      return await fn();
    } finally {
      end();
    }
  }
}
