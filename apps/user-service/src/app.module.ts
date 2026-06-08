import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health/health.controller';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { UserGrpcModule } from './grpc/user-grpc.module';
import { User } from './users/user.entity';
import { RefreshToken } from './users/refresh-token.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        database: config.get('DB_NAME', 'ridewave_users'),
        username: config.get('DB_USER', 'postgres'),
        password: config.get('DB_PASS', 'postgres'),
        entities: [User, RefreshToken],
        synchronize: true,
        logging: false,
      }),
      inject: [ConfigService],
    }),
    TerminusModule,
    UsersModule,
    AuthModule,
    UserGrpcModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
