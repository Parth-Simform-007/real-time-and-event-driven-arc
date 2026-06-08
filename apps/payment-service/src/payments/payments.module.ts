import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from './payment.entity';
import { PaymentsService } from './payments.service';
import { EventConsumerService } from './event-consumer.service';

@Module({
  imports: [TypeOrmModule.forFeature([Payment])],
  providers: [PaymentsService, EventConsumerService],
})
export class PaymentsModule {}
