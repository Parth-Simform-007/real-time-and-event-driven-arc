import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET'),
        signOptions: {
          expiresIn: config.get('JWT_ACCESS_EXPIRES_IN', '15m'),
        },
      }),
      inject: [ConfigService],
    }),
    ClientsModule.registerAsync([{
      name: 'USER_SERVICE',
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        transport: Transport.GRPC,
        options: {
          package: 'user',
          protoPath: join(process.cwd(), 'libs/proto/src/user.proto'),
          url: config.get('USER_SERVICE_GRPC_URL', 'localhost:50051'),
        },
      }),
      inject: [ConfigService],
    }]),
  ],
  providers: [JwtStrategy],
  exports: [JwtModule, PassportModule, ClientsModule],
})
export class AuthModule {}
