import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { IdGeneratorPort } from '@application/ports/id-generator.port';

@Injectable()
export class UuidIdGenerator implements IdGeneratorPort {
  generate(): string {
    return randomUUID();
  }
}
