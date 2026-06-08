import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment } from './payment.entity';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
  ) {}

  async createPending(
    rideId: string,
    riderId: string,
    correlationId: string,
  ): Promise<Payment> {
    const payment = this.paymentRepo.create({ rideId, riderId, correlationId });
    return this.paymentRepo.save(payment);
  }

  async findByRide(rideId: string): Promise<Payment | null> {
    return this.paymentRepo.findOne({ where: { rideId } });
  }
}
