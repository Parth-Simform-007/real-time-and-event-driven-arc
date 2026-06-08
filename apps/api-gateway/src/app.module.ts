import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TerminusModule } from '@nestjs/terminus';
import { HttpModule } from '@nestjs/axios';
import { HealthController } from './health/health.controller';
import { ProxyModule } from './proxy/proxy.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TerminusModule,
    HttpModule,
    AuthModule,
    ProxyModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
