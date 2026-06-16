import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger, Inject, OnModuleInit } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
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

@WebSocketGateway({ cors: { origin: '*' } })
export class RidesGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(RidesGateway.name);
  private userGrpcService: UserGrpcService;

  constructor(@Inject('USER_SERVICE') private readonly userClient: ClientGrpc) {}

  onModuleInit() {
    this.userGrpcService = this.userClient.getService<UserGrpcService>('UserService');
  }

  async handleConnection(client: Socket) {
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) {
      this.logger.warn(`Connection rejected — no token [socketId=${client.id}]`);
      client.disconnect();
      return;
    }

    try {
      const result = await firstValueFrom(this.userGrpcService.ValidateToken({ token }));
      if (!result.valid) {
        this.logger.warn(`Connection rejected — invalid token [socketId=${client.id}]`);
        client.disconnect();
        return;
      }
      client.data.user = { userId: result.userId, email: result.email, role: result.role };
      this.logger.log(
        `Client connected: ${client.id} (userId=${result.userId} role=${result.role})`,
      );
    } catch {
      this.logger.error(`Token validation failed [socketId=${client.id}]`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data.user?.userId ?? 'unauthenticated';
    this.logger.log(`Client disconnected: ${client.id} (userId=${userId})`);
  }

  @SubscribeMessage('ride:join')
  handleJoin(@ConnectedSocket() client: Socket, @MessageBody() data: { rideId: string }) {
    client.join(`ride:${data.rideId}`);
    this.logger.log(`${client.id} joined room ride:${data.rideId}`);
  }

  @SubscribeMessage('driver:location:update')
  handleLocationUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: { rideId: string; lat: number; lng: number; heading?: number; speed?: number },
  ) {
    client.to(`ride:${data.rideId}`).emit('ride:driver:location', data);
  }

  broadcastRideStatus(rideId: string, eventType: string, payload: unknown) {
    this.server.to(`ride:${rideId}`).emit('ride:status:changed', { eventType, payload });
    this.logger.log(`Broadcast ${eventType} to room ride:${rideId}`);
  }
}
