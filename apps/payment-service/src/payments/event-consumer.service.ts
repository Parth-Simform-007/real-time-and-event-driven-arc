import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import * as amqplib from 'amqplib';
import { PaymentsService } from './payments.service';

const RIDE_EXCHANGE = 'ride-events';
const QUEUE = 'payment.rides';

@Injectable()
export class EventConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventConsumerService.name);
  private connection: amqplib.ChannelModel;
  private channel: amqplib.Channel;

  constructor(private readonly paymentsService: PaymentsService) {}

  async onModuleInit() {
    try {
      this.connection = await amqplib.connect(
        process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
      );
      this.channel = await this.connection.createChannel();
      await this.channel.assertExchange(RIDE_EXCHANGE, 'topic', {
        durable: true,
      });
      await this.channel.assertQueue(QUEUE, { durable: true });
      await this.channel.bindQueue(QUEUE, RIDE_EXCHANGE, 'ride.requested');
      await this.channel.bindQueue(QUEUE, RIDE_EXCHANGE, 'ride.completed');
      await this.channel.bindQueue(QUEUE, RIDE_EXCHANGE, 'ride.cancelled');
      this.channel.prefetch(1);

      this.channel.consume(QUEUE, async (msg) => {
        if (!msg) return;
        try {
          const envelope = JSON.parse(msg.content.toString());
          this.logger.log(`[Payment] Received ${envelope.eventType} [eventId=${envelope.eventId}]`);

          if (envelope.eventType === 'ride.requested') {
            await this.paymentsService.createPending(
              envelope.payload.rideId,
              envelope.payload.riderId,
              envelope.correlationId,
            );
          }

          this.channel.ack(msg);
        } catch (err) {
          this.logger.error('Failed to process event', err);
          this.channel.nack(msg, false, false);
        }
      });

      this.logger.log('Payment Service event consumer started');
    } catch (err) {
      this.logger.error('Failed to connect RabbitMQ consumer', err);
    }
  }

  async onModuleDestroy() {
    await this.channel?.close();
    await this.connection?.close();
  }
}
