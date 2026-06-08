import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('processed_events')
export class ProcessedEvent {
  @PrimaryColumn()
  eventId: string;

  @Column()
  eventType: string;

  @Column()
  sourceService: string;

  @CreateDateColumn()
  processedAt: Date;
}
