import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Get a user profile by id — auth enforced at gateway' })
  async getUser(@Param('id') id: string) {
    const user = await this.usersService.findById(id);
    const { passwordHash, ...profile } = user as any;
    return profile;
  }
}
