import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RequestRideDto {
  @ApiProperty({ example: 'MG Road, Bengaluru' })
  pickupAddress: string;

  @ApiProperty({ example: 12.9758 })
  pickupLat: number;

  @ApiProperty({ example: 77.6012 })
  pickupLng: number;

  @ApiProperty({ example: 'Indiranagar, Bengaluru' })
  dropoffAddress: string;

  @ApiProperty({ example: 12.9784 })
  dropoffLat: number;

  @ApiProperty({ example: 77.6408 })
  dropoffLng: number;
}

export class MatchRideDto {
  @ApiProperty({ example: 'uuid-of-driver' })
  driverId: string;

  @ApiPropertyOptional({ example: 5 })
  estimatedArrivalMinutes?: number;
}

export class CompleteRideDto {
  @ApiProperty({ example: 250 })
  fareAmount: number;
}

export class CancelRideDto {
  @ApiProperty({ enum: ['rider', 'driver', 'system'], example: 'rider' })
  cancelledBy: 'rider' | 'driver' | 'system';

  @ApiPropertyOptional({ example: 'Change of plans' })
  reason?: string;
}
