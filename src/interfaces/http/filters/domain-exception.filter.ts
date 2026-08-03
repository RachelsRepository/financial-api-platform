import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  AuthorizationError,
  ConsentError,
  DomainError,
  IdempotencyConflictError,
  InvalidStateTransitionError,
  PaymentError,
  TokenError,
  TokenReuseDetectedError,
} from '../../../domain/errors';

interface ErrorBody {
  statusCode: number;
  error: string;
  message: string;
  code: string;
}

@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      response.status(status).send(body);
      return;
    }

    const mapped = this.mapDomainError(exception);
    if (mapped !== null) {
      this.logger.warn(
        { code: mapped.code, path: request.url, method: request.method },
        mapped.message,
      );
      response.status(mapped.statusCode).send({
        statusCode: mapped.statusCode,
        error: mapped.error,
        message: mapped.message,
        code: mapped.code,
      } satisfies ErrorBody);
      return;
    }

    this.logger.error(
      { err: exception, path: request.url, method: request.method },
      'Unhandled exception',
    );
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
      code: 'internal_error',
    } satisfies ErrorBody);
  }

  private mapDomainError(exception: unknown): ErrorBody | null {
    if (!(exception instanceof DomainError)) {
      return null;
    }

    if (exception instanceof InvalidStateTransitionError) {
      return this.body(HttpStatus.CONFLICT, 'Conflict', exception.message, exception.code);
    }

    if (exception instanceof IdempotencyConflictError) {
      return this.body(HttpStatus.CONFLICT, 'Conflict', exception.message, exception.code);
    }

    if (exception instanceof TokenReuseDetectedError) {
      return this.body(HttpStatus.UNAUTHORIZED, 'Unauthorized', exception.message, exception.code);
    }

    if (exception instanceof TokenError) {
      return this.body(HttpStatus.BAD_REQUEST, 'Bad Request', exception.message, exception.code);
    }

    if (exception instanceof ConsentError) {
      return this.body(HttpStatus.FORBIDDEN, 'Forbidden', exception.message, exception.code);
    }

    if (exception instanceof PaymentError) {
      return this.body(HttpStatus.BAD_REQUEST, 'Bad Request', exception.message, exception.code);
    }

    if (exception instanceof AuthorizationError) {
      const status = this.authorizationStatus(exception.code);
      let label = 'Unauthorized';
      if (status === 404) {
        label = 'Not Found';
      } else if (status === 403) {
        label = 'Forbidden';
      }
      return this.body(status, label, exception.message, exception.code);
    }

    return this.body(HttpStatus.BAD_REQUEST, 'Bad Request', exception.message, exception.code);
  }

  private authorizationStatus(code: string): number {
    switch (code) {
      case 'not_found':
      case 'invalid_institution':
        return HttpStatus.NOT_FOUND;
      case 'forbidden':
      case 'consent_mismatch':
      case 'client_mismatch':
      case 'insufficient_scope':
      case 'invalid_state':
        return HttpStatus.FORBIDDEN;
      case 'invalid_client':
      case 'invalid_grant':
      case 'invalid_token':
        return HttpStatus.UNAUTHORIZED;
      default:
        return HttpStatus.BAD_REQUEST;
    }
  }

  private body(statusCode: number, error: string, message: string, code: string): ErrorBody {
    return { statusCode, error, message, code };
  }
}
