import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientGrpc } from '@nestjs/microservices';
import { Observable, firstValueFrom } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { Ride, RideStatus } from './ride.entity';
import { RequestRideDto } from './dto/request-ride.dto';
import { MatchRideDto } from './dto/match-ride.dto';
import { EventPublisherService } from './event-publisher.service';

interface UserGrpcService {
  GetDriver(data: { driverId: string }): Observable<{
    id: string;
    fullName: string;
    isActive: boolean;
    role: string;
  }>;
}

@Injectable()
export class RidesService implements OnModuleInit {
  private userGrpcService: UserGrpcService;

  constructor(
    @InjectRepository(Ride)
    private readonly rideRepo: Repository<Ride>,
    private readonly publisher: EventPublisherService,
    @Inject('USER_SERVICE') private readonly userClient: ClientGrpc,
  ) {}

  onModuleInit() {
    this.userGrpcService = this.userClient.getService<UserGrpcService>('UserService');
  }

  async requestRide(riderId: string, dto: RequestRideDto): Promise<Ride> {
    const correlationId = uuidv4();
    const ride = this.rideRepo.create({
      riderId,
      status: RideStatus.REQUESTED,
      pickupAddress: dto.pickupAddress,
      pickupLat: dto.pickupLat,
      pickupLng: dto.pickupLng,
      dropoffAddress: dto.dropoffAddress,
      dropoffLat: dto.dropoffLat,
      dropoffLng: dto.dropoffLng,
      correlationId,
    });
    const saved = await this.rideRepo.save(ride);

    await this.publisher.publish(
      'ride.requested',
      {
        rideId: saved.id,
        riderId,
        pickupLocation: {
          lat: dto.pickupLat,
          lng: dto.pickupLng,
          address: dto.pickupAddress,
        },
        dropoffLocation: {
          lat: dto.dropoffLat,
          lng: dto.dropoffLng,
          address: dto.dropoffAddress,
        },
        requestedAt: saved.createdAt.toISOString(),
      },
      correlationId,
    );

    return saved;
  }

  async matchRide(rideId: string, dto: MatchRideDto): Promise<Ride> {
    const driver = await firstValueFrom(
      this.userGrpcService.GetDriver({ driverId: dto.driverId }),
    );
    if (!driver?.id || driver.role !== 'DRIVER' || !driver.isActive) {
      throw new BadRequestException('Driver not found or not eligible');
    }

    const ride = await this.findById(rideId);
    if (ride.status !== RideStatus.REQUESTED) {
      throw new BadRequestException(
        `Cannot match ride in status ${ride.status}`,
      );
    }
    ride.status = RideStatus.MATCHED;
    ride.driverId = dto.driverId;
    const saved = await this.rideRepo.save(ride);

    await this.publisher.publish(
      'ride.matched',
      {
        rideId: saved.id,
        riderId: saved.riderId,
        driverId: dto.driverId,
        estimatedArrivalMinutes: dto.estimatedArrivalMinutes ?? 5,
      },
      ride.correlationId,
    );

    return saved;
  }

  async startRide(rideId: string): Promise<Ride> {
    const ride = await this.findById(rideId);
    if (ride.status !== RideStatus.MATCHED) {
      throw new BadRequestException(
        `Cannot start ride in status ${ride.status}`,
      );
    }
    ride.status = RideStatus.IN_PROGRESS;
    return this.rideRepo.save(ride);
  }

  async completeRide(rideId: string, fareAmount: number): Promise<Ride> {
    const ride = await this.findById(rideId);
    if (ride.status !== RideStatus.IN_PROGRESS) {
      throw new BadRequestException(
        `Cannot complete ride in status ${ride.status}`,
      );
    }
    ride.status = RideStatus.COMPLETED;
    ride.fareAmount = fareAmount;
    const saved = await this.rideRepo.save(ride);

    await this.publisher.publish(
      'ride.completed',
      {
        rideId: saved.id,
        riderId: saved.riderId,
        driverId: saved.driverId,
        fareAmount,
        durationMinutes: 0,
        completedAt: new Date().toISOString(),
      },
      ride.correlationId,
    );

    return saved;
  }

  async cancelRide(
    rideId: string,
    cancelledBy: 'rider' | 'driver' | 'system',
    reason?: string,
  ): Promise<Ride> {
    const ride = await this.findById(rideId);
    if (
      ride.status === RideStatus.COMPLETED ||
      ride.status === RideStatus.CANCELLED
    ) {
      throw new BadRequestException(
        `Cannot cancel ride in status ${ride.status}`,
      );
    }
    ride.status = RideStatus.CANCELLED;
    const saved = await this.rideRepo.save(ride);

    await this.publisher.publish(
      'ride.cancelled',
      {
        rideId: saved.id,
        riderId: saved.riderId,
        driverId: saved.driverId,
        cancelledBy,
        reason,
      },
      ride.correlationId,
    );

    return saved;
  }

  async findById(rideId: string): Promise<Ride> {
    const ride = await this.rideRepo.findOne({ where: { id: rideId } });
    if (!ride) throw new NotFoundException('Ride not found');
    return ride;
  }

  async findByRider(riderId: string): Promise<Ride[]> {
    return this.rideRepo.find({
      where: { riderId },
      order: { createdAt: 'DESC' },
    });
  }
}
