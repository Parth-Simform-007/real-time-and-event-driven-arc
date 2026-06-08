import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum RideStatus {
  REQUESTED = 'REQUESTED',
  MATCHED = 'MATCHED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

@Entity('rides')
export class Ride {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  riderId: string;

  @Column({ nullable: true })
  driverId: string;

  @Column({ type: 'enum', enum: RideStatus, default: RideStatus.REQUESTED })
  status: RideStatus;

  @Column()
  pickupAddress: string;

  @Column({ type: 'decimal', precision: 9, scale: 6 })
  pickupLat: number;

  @Column({ type: 'decimal', precision: 9, scale: 6 })
  pickupLng: number;

  @Column()
  dropoffAddress: string;

  @Column({ type: 'decimal', precision: 9, scale: 6 })
  dropoffLat: number;

  @Column({ type: 'decimal', precision: 9, scale: 6 })
  dropoffLng: number;

  @Column({ nullable: true, type: 'decimal', precision: 10, scale: 2 })
  fareAmount: number;

  @Column({ nullable: true })
  correlationId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
