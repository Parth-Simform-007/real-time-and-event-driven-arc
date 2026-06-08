import { IsString, IsNumber, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RequestRideDto {
  @ApiProperty({ example: '5th Ave' })
  @IsString()
  @IsNotEmpty()
  pickupAddress: string;

  @ApiProperty({ example: 40.741 })
  @IsNumber()
  pickupLat: number;

  @ApiProperty({ example: -73.989 })
  @IsNumber()
  pickupLng: number;

  @ApiProperty({ example: 'JFK Airport' })
  @IsString()
  @IsNotEmpty()
  dropoffAddress: string;

  @ApiProperty({ example: 40.641 })
  @IsNumber()
  dropoffLat: number;

  @ApiProperty({ example: -73.778 })
  @IsNumber()
  dropoffLng: number;
}
