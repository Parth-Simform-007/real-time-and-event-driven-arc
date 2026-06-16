import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import * as amqplib from 'amqplib';
import { RidesGateway } from './rides.gateway';

const RIDE_EXCHANGE = 'ride-events';
const QUEUE = 'websocket.rides';

@Injectable()
export class RidesEventConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RidesEventConsumerService.name);
  private connection: amqplib.ChannelModel;
  private channel: amqplib.Channel;

  constructor(private readonly ridesGateway: RidesGateway) {}

  async onModuleInit() {
    try {
      this.connection = await amqplib.connect(
        process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
      );
      this.channel = await this.connection.createChannel();

      await this.channel.assertExchange(RIDE_EXCHANGE, 'topic', { durable: true });
      await this.channel.assertQueue(QUEUE, { durable: true });

      await this.channel.bindQueue(QUEUE, RIDE_EXCHANGE, 'ride.requested');
      await this.channel.bindQueue(QUEUE, RIDE_EXCHANGE, 'ride.matched');
      await this.channel.bindQueue(QUEUE, RIDE_EXCHANGE, 'ride.in_progress');
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

        const { eventType, payload } = envelope;
        const rideId: string | undefined = payload?.rideId;

        if (!rideId) {
          this.logger.warn(`No rideId in payload for ${eventType}, dropping`);
          this.channel.ack(msg);
          return;
        }

        try {
          this.ridesGateway.broadcastRideStatus(rideId, eventType, payload);
          this.channel.ack(msg);
        } catch (err) {
          this.logger.error(`Failed to broadcast ${eventType} for ride ${rideId}`, err);
          this.channel.nack(msg, false, false);
        }
      });

      this.logger.log(`WebSocket event consumer started — queue: ${QUEUE}`);
    } catch (err) {
      this.logger.error('Failed to connect RabbitMQ consumer', err);
    }
  }

  async onModuleDestroy() {
    await this.channel?.close();
    await this.connection?.close();
  }
}
