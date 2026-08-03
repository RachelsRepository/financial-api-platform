import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, type Producer, type ProducerRecord } from 'kafkajs';
import type { DomainEvent } from '../../../domain/events';
import type { EventPublisherPort } from '../../../application/ports/event-publisher.port';
import { CONFIG_KEY, type AppConfig } from '../../../config/configuration';

export interface KafkaPublisherConfig {
  readonly brokers: string[];
  readonly clientId: string;
  readonly topic: string;
  readonly enabled: boolean;
}

@Injectable()
export class KafkaPublisher implements EventPublisherPort, OnModuleInit, OnModuleDestroy {
  private producer: Producer | null = null;
  private readonly config: KafkaPublisherConfig;

  constructor(@Inject(ConfigService) configService: ConfigService) {
    const appConfig = configService.getOrThrow<AppConfig>(CONFIG_KEY);
    const brokers = appConfig.KAFKA_BROKERS.split(',')
      .map((broker) => broker.trim())
      .filter(Boolean);

    const enabled = appConfig.KAFKA_ENABLED ? brokers.length > 0 : false;

    this.config = {
      brokers,
      clientId: appConfig.KAFKA_CLIENT_ID,
      topic: appConfig.KAFKA_OUTBOX_TOPIC,
      enabled,
    };
  }

  async onModuleInit(): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    const kafka = new Kafka({
      clientId: this.config.clientId,
      brokers: this.config.brokers,
    });

    this.producer = kafka.producer();
    try {
      await this.producer.connect();
    } catch {
      this.producer = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.producer !== null) {
      await this.producer.disconnect();
      this.producer = null;
    }
  }

  isEnabled(): boolean {
    return this.config.enabled && this.producer !== null;
  }

  getTopic(): string {
    return this.config.topic;
  }

  async publish(event: DomainEvent): Promise<void> {
    if (!this.isEnabled() || this.producer === null) {
      return;
    }

    const record: ProducerRecord = {
      topic: this.config.topic,
      messages: [
        {
          key: event.aggregateId,
          value: JSON.stringify({
            eventId: event.eventId,
            aggregateId: event.aggregateId,
            aggregateType: event.aggregateType,
            eventType: event.eventType,
            version: event.version,
            timestamp: event.timestamp.toISOString(),
            correlationId: event.correlationId,
            causationId: event.causationId,
            producer: event.producer,
            payload: event.payload,
          }),
          headers: {
            eventType: event.eventType,
            aggregateType: event.aggregateType,
          },
        },
      ],
    };

    await this.producer.send(record);
  }
}
