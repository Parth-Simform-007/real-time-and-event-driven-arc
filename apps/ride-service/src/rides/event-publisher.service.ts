import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import * as amqplib from 'amqplib';
import { v4 as uuidv4 } from 'uuid';

const RIDE_EXCHANGE = 'ride-events';

@Injectable()
export class EventPublisherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventPublisherService.name);
  private connection: amqplib.ChannelModel;
  private channel: amqplib.Channel;

  async onModuleInit() {
    try {
      this.connection = await amqplib.connect(
        process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
      );
      this.channel = await this.connection.createChannel();
      await this.channel.assertExchange(RIDE_EXCHANGE, 'topic', {
        durable: true,
      });
      this.logger.log('RabbitMQ publisher connected');
    } catch (err) {
      this.logger.error('Failed to connect to RabbitMQ', err);
    }
  }

  async publish(
    eventType: string,
    payload: unknown,
    correlationId?: string,
  ): Promise<void> {
    if (!this.channel) {
      this.logger.warn('RabbitMQ channel not ready — skipping publish');
      return;
    }
    const envelope = {
      eventId: uuidv4(),
      eventType,
      version: '1.0',
      timestamp: new Date().toISOString(),
      sourceService: 'ride-service',
      correlationId: correlationId || uuidv4(),
      payload,
    };
    this.channel.publish(
      RIDE_EXCHANGE,
      eventType,
      Buffer.from(JSON.stringify(envelope)),
      { persistent: true },
    );
    this.logger.log(
      `Published ${eventType} [eventId=${envelope.eventId}]`,
    );
  }

  async onModuleDestroy() {
    await this.channel?.close();
    await this.connection?.close();
  }
}
