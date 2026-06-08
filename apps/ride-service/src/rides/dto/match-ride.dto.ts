import { IsString, IsNotEmpty, IsNumber, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MatchRideDto {
  @ApiProperty({ example: 'driver-123' })
  @IsString()
  @IsNotEmpty()
  driverId: string;

  @ApiPropertyOptional({ example: 4, default: 5 })
  @IsOptional()
  @IsNumber()
  estimatedArrivalMinutes?: number;
}
