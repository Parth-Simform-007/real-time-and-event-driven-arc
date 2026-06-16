import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { RidesGateway } from './rides.gateway';
import { RidesEventConsumerService } from './rides-event-consumer.service';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
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
      },
    ]),
  ],
  providers: [RidesGateway, RidesEventConsumerService],
})
export class RidesModule {}
