import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export enum PaymentStatus {
  PENDING = 'PENDING',
  PREAUTHORIZED = 'PREAUTHORIZED',
  COMPLETED = 'COMPLETED',
  REFUNDED = 'REFUNDED',
  FAILED = 'FAILED',
}

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  rideId: string;

  @Column()
  riderId: string;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  status: PaymentStatus;

  @Column({ nullable: true, type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ nullable: true })
  correlationId: string;

  @CreateDateColumn()
  createdAt: Date;
}
