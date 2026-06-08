import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProcessedEvent } from './processed-event.entity';
import { NotificationsService } from './notifications.service';
import { EventConsumerService } from './event-consumer.service';

@Module({
  imports: [TypeOrmModule.forFeature([ProcessedEvent])],
  providers: [NotificationsService, EventConsumerService],
})
export class NotificationsModule {}
