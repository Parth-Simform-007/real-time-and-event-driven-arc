import { Injectable, HttpException, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ProxyService {
  private readonly logger = new Logger(ProxyService.name);

  constructor(private readonly http: HttpService) {}

  async forward(serviceUrl: string, method: string, path: string, data?: any, user?: any) {
    const correlationId = uuidv4();
    const headers: Record<string, string> = {
      'x-correlation-id': correlationId,
      'content-type': 'application/json',
    };
    if (user) {
      headers['x-user-id'] = user.userId;
      headers['x-user-role'] = user.role;
    }

    try {
      const response = await firstValueFrom(
        this.http.request({
          method,
          url: `${serviceUrl}${path}`,
          data,
          headers,
        }),
      );
      return response.data;
    } catch (err) {
      const status = err.response?.status || 500;
      const message = err.response?.data || 'Upstream service error';
      this.logger.error(`Proxy error → ${serviceUrl}${path}: ${status}`);
      throw new HttpException(message, status);
    }
  }
}
