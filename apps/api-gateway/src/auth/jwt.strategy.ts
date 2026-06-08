import { Injectable, Inject, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { ClientGrpc } from '@nestjs/microservices';
import { Observable, firstValueFrom } from 'rxjs';

interface UserGrpcService {
  ValidateToken(data: { token: string }): Observable<{
    valid: boolean;
    userId: string;
    email: string;
    role: string;
  }>;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) implements OnModuleInit {
  private userGrpcService!: UserGrpcService;

  constructor(
    config: ConfigService,
    @Inject('USER_SERVICE') private readonly userClient: ClientGrpc,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET'),
      passReqToCallback: true,
    });
  }

  onModuleInit() {
    this.userGrpcService = this.userClient.getService<UserGrpcService>('UserService');
  }

  async validate(request: any, _payload: any) {
    const authHeader = request.headers['authorization'] as string;
    const token = authHeader?.split(' ')[1];

    const result = await firstValueFrom(
      this.userGrpcService.ValidateToken({ token }),
    );

    if (!result.valid) throw new UnauthorizedException();
    return { userId: result.userId, email: result.email, role: result.role };
  }
}
