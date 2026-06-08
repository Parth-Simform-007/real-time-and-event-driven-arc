import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';

interface ValidateTokenRequest { token: string; }
interface GetUserRequest       { userId: string; }
interface GetDriverRequest     { driverId: string; }

@Controller()
export class UserGrpcController {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  @GrpcMethod('UserService', 'ValidateToken')
  async validateToken({ token }: ValidateTokenRequest) {
    try {
      const payload = this.jwtService.verify(token);
      return { valid: true, userId: payload.sub, email: payload.email, role: payload.role };
    } catch {
      return { valid: false, userId: '', email: '', role: '' };
    }
  }

  @GrpcMethod('UserService', 'GetUser')
  async getUser({ userId }: GetUserRequest) {
    try {
      const user = await this.usersService.findById(userId);
      return { id: user.id, email: user.email, fullName: user.fullName, role: user.role, isActive: user.isActive };
    } catch {
      return { id: '', email: '', fullName: '', role: '', isActive: false };
    }
  }

  @GrpcMethod('UserService', 'GetDriver')
  async getDriver({ driverId }: GetDriverRequest) {
    try {
      const user = await this.usersService.findById(driverId);
      return { id: user.id, fullName: user.fullName, isActive: user.isActive, role: user.role };
    } catch {
      return { id: '', fullName: '', isActive: false, role: '' };
    }
  }
}
