import {
  Controller,
  Post,
  Patch,
  Get,
  Body,
  Param,
  Headers,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { RidesService } from './rides.service';
import { RequestRideDto } from './dto/request-ride.dto';
import { MatchRideDto } from './dto/match-ride.dto';

@ApiTags('rides')
@Controller('rides')
export class RidesController {
  constructor(private readonly ridesService: RidesService) {}

  @Post()
  @ApiOperation({ summary: 'Request a ride (REQUESTED); publishes ride.requested' })
  requestRide(
    @Headers('x-user-id') userId: string,
    @Body() dto: RequestRideDto,
  ) {
    return this.ridesService.requestRide(userId, dto);
  }

  @Patch(':id/match')
  @ApiOperation({ summary: 'Match a driver (REQUESTED → MATCHED); publishes ride.matched' })
  matchRide(@Param('id') id: string, @Body() dto: MatchRideDto) {
    return this.ridesService.matchRide(id, dto);
  }

  @Patch(':id/start')
  @ApiOperation({ summary: 'Start the ride (MATCHED → IN_PROGRESS)' })
  startRide(@Param('id') id: string) {
    return this.ridesService.startRide(id);
  }

  @Patch(':id/complete')
  @ApiOperation({ summary: 'Complete the ride (IN_PROGRESS → COMPLETED); publishes ride.completed' })
  completeRide(
    @Param('id') id: string,
    @Body('fareAmount') fareAmount: number,
  ) {
    return this.ridesService.completeRide(id, fareAmount);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancel the ride; publishes ride.cancelled' })
  cancelRide(
    @Param('id') id: string,
    @Body('cancelledBy') cancelledBy: 'rider' | 'driver' | 'system',
    @Body('reason') reason?: string,
  ) {
    return this.ridesService.cancelRide(id, cancelledBy, reason);
  }

  @Get('history')
  @ApiOperation({ summary: 'List ride history for the calling rider' })
  getRiderHistory(@Headers('x-user-id') userId: string) {
    return this.ridesService.findByRider(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single ride by id' })
  getRide(@Param('id') id: string) {
    return this.ridesService.findById(id);
  }
}
