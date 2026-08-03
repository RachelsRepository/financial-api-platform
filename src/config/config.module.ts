import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { configurationFactory } from './configuration';

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      expandVariables: true,
      load: [configurationFactory],
    }),
  ],
  exports: [NestConfigModule],
})
export class ConfigModule {}

export { CONFIG_KEY, type AppConfig } from './configuration';
