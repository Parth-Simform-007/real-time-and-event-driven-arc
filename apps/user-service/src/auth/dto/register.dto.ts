import { IsEmail, IsString, MinLength, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '../../users/user.entity';

export class RegisterDto {
  @ApiProperty({ example: 'rider@test.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'password123', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ example: 'Test Rider' })
  @IsString()
  fullName: string;

  @ApiProperty({ example: '+15550001111' })
  @IsString()
  phone: string;

  @ApiPropertyOptional({ enum: UserRole, default: UserRole.RIDER })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole = UserRole.RIDER;
}
