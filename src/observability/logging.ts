import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Params } from 'nestjs-pino';
import type { AppConfig } from '../config/configuration';

const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'req.body.client_secret',
  'req.body.refresh_token',
  'req.body.access_token',
  'req.body.code',
  'req.body.code_verifier',
  'req.body.password',
  'req.body.token',
  'res.headers["set-cookie"]',
  '*.clientSecret',
  '*.client_secret',
  '*.refreshToken',
  '*.refresh_token',
  '*.accessToken',
  '*.access_token',
  '*.authorizationCode',
  '*.authorization_code',
  '*.codeVerifier',
  '*.code_verifier',
  '*.privateKey',
  '*.private_key',
  '*.accountNumber',
  '*.account_number',
  '*.iban',
];

function resolvePrettyTransport():
  { target: string; options: Record<string, boolean | string> } | undefined {
  try {
    require.resolve('pino-pretty');
    return {
      target: 'pino-pretty',
      options: {
        colorize: true,
        singleLine: true,
        translateTime: 'SYS:standard',
      },
    };
  } catch {
    return undefined;
  }
}

export function buildPinoConfig(config: AppConfig): Params {
  const isDevelopment = config.NODE_ENV === 'development';

  return {
    pinoHttp: {
      level: config.LOG_LEVEL,
      redact: {
        paths: REDACT_PATHS,
        censor: '[REDACTED]',
      },
      genReqId: (req: IncomingMessage) => {
        const header = req.headers['x-correlation-id'];
        if (typeof header === 'string' && header.length > 0) {
          return header;
        }
        return randomUUID();
      },
      customProps: (req: IncomingMessage) => ({
        correlationId:
          typeof req.headers['x-correlation-id'] === 'string'
            ? req.headers['x-correlation-id']
            : undefined,
      }),
      customSuccessMessage: (req: IncomingMessage, res: ServerResponse) =>
        `${req.method ?? 'UNKNOWN'} ${req.url ?? ''} ${res.statusCode}`,
      customErrorMessage: (req: IncomingMessage, res: ServerResponse, error: Error) =>
        `${req.method ?? 'UNKNOWN'} ${req.url ?? ''} ${res.statusCode} - ${error.message}`,
      transport: isDevelopment ? resolvePrettyTransport() : undefined,
    },
  };
}
