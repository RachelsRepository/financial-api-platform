import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { CONFIG_KEY, type AppConfig } from '../config/configuration';
import { buildPinoConfig } from './logging';

@Global()
@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        buildPinoConfig(configService.getOrThrow<AppConfig>(CONFIG_KEY)),
    }),
  ],
  exports: [LoggerModule],
})
export class ObservabilityModule {}
