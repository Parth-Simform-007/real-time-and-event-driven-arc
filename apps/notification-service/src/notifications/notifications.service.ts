import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProcessedEvent } from './processed-event.entity';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(ProcessedEvent)
    private readonly processedEventRepo: Repository<ProcessedEvent>,
  ) {}

  async isAlreadyProcessed(eventId: string): Promise<boolean> {
    const existing = await this.processedEventRepo.findOne({
      where: { eventId },
    });
    return !!existing;
  }

  async markProcessed(eventId: string, eventType: string, sourceService: string): Promise<void> {
    const record = this.processedEventRepo.create({
      eventId,
      eventType,
      sourceService,
    });
    await this.processedEventRepo.save(record);
  }

  sendRideRequestedNotification(payload: any) {
    this.logger.log(
      `[NOTIFY] Ride requested — riderId=${payload.riderId} rideId=${payload.rideId} pickup="${payload.pickupLocation?.address}"`,
    );
  }

  sendRideMatchedNotification(payload: any) {
    this.logger.log(
      `[NOTIFY] Ride matched — riderId=${payload.riderId} driverId=${payload.driverId} rideId=${payload.rideId}`,
    );
  }

  sendRideCompletedNotification(payload: any) {
    this.logger.log(
      `[NOTIFY] Ride completed — riderId=${payload.riderId} fare=${payload.fareAmount} rideId=${payload.rideId}`,
    );
  }

  sendRideCancelledNotification(payload: any) {
    this.logger.log(
      `[NOTIFY] Ride cancelled — riderId=${payload.riderId} reason=${payload.reason || 'n/a'} rideId=${payload.rideId}`,
    );
  }
}
