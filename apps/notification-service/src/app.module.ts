import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health/health.controller';
import { NotificationsModule } from './notifications/notifications.module';
import { ProcessedEvent } from './notifications/processed-event.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        database: config.get('DB_NAME', 'ridewave_notifications'),
        username: config.get('DB_USER', 'postgres'),
        password: config.get('DB_PASS', 'postgres'),
        entities: [ProcessedEvent],
        synchronize: true,
        logging: false,
      }),
      inject: [ConfigService],
    }),
    TerminusModule,
    NotificationsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
