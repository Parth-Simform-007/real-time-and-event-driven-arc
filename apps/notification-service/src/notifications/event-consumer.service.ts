import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import * as amqplib from 'amqplib';
import { NotificationsService } from './notifications.service';

const RIDE_EXCHANGE = 'ride-events';
const QUEUE = 'notification.rides';

@Injectable()
export class EventConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventConsumerService.name);
  private connection: amqplib.ChannelModel;
  private channel: amqplib.Channel;

  constructor(private readonly notificationsService: NotificationsService) {}

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
      await this.channel.bindQueue(QUEUE, RIDE_EXCHANGE, 'ride.matched');
      await this.channel.bindQueue(QUEUE, RIDE_EXCHANGE, 'ride.completed');
      await this.channel.bindQueue(QUEUE, RIDE_EXCHANGE, 'ride.cancelled');

      this.channel.prefetch(1);

      this.channel.consume(QUEUE, async (msg) => {
        if (!msg) return;

        let envelope: any;
        try {
          envelope = JSON.parse(msg.content.toString());
        } catch {
          this.logger.error('Invalid message — malformed JSON, dropping');
          this.channel.ack(msg);
          return;
        }

        const { eventId, eventType, sourceService, payload } = envelope;

        // ── IDEMPOTENCY CHECK ────────────────────────────────────────────
        const alreadyProcessed = await this.notificationsService.isAlreadyProcessed(eventId);
        if (alreadyProcessed) {
          this.logger.warn(`[IDEMPOTENCY] Skipping duplicate eventId=${eventId} type=${eventType}`);
          this.channel.ack(msg);
          return;
        }

        try {
          switch (eventType) {
            case 'ride.requested':
              this.notificationsService.sendRideRequestedNotification(payload);
              break;
            case 'ride.matched':
              this.notificationsService.sendRideMatchedNotification(payload);
              break;
            case 'ride.completed':
              this.notificationsService.sendRideCompletedNotification(payload);
              break;
            case 'ride.cancelled':
              this.notificationsService.sendRideCancelledNotification(payload);
              break;
            default:
              this.logger.warn(`Unhandled event type: ${eventType}`);
          }

          // Mark processed AFTER successful handling to ensure at-least-once delivery
          await this.notificationsService.markProcessed(eventId, eventType, sourceService);
          this.channel.ack(msg);
          this.logger.log(`Processed ${eventType} [eventId=${eventId}]`);
        } catch (err) {
          this.logger.error(`Failed to handle ${eventType} [eventId=${eventId}]`, err);
          // nack without requeue — prevents infinite loop; use DLQ in Phase 2
          this.channel.nack(msg, false, false);
        }
      });

      this.logger.log(`Notification Service consumer started — queue: ${QUEUE}`);
    } catch (err) {
      this.logger.error('Failed to connect RabbitMQ consumer', err);
    }
  }

  async onModuleDestroy() {
    await this.channel?.close();
    await this.connection?.close();
  }
}
