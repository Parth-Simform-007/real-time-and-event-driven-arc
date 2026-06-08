import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { join } from 'path';
import { Ride } from './ride.entity';
import { RidesService } from './rides.service';
import { RidesController } from './rides.controller';
import { EventPublisherService } from './event-publisher.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Ride]),
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
  providers: [RidesService, EventPublisherService],
  controllers: [RidesController],
})
export class RidesModule {}
