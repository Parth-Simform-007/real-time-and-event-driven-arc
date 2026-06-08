import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';

/**
 * Logs every incoming HTTP request for the service it is registered in.
 * Output example (context = the service name):
 *   [user-service] --> POST /api/auth/login
 *   [user-service] <-- POST /api/auth/login 200 (23ms)
 * The correlation id (injected by the API Gateway) is included when present
 * so a single request can be traced across services.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger: Logger;

  constructor(serviceName = 'HTTP') {
    this.logger = new Logger(serviceName);
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const { method, originalUrl } = req;
    const correlationId = req.headers['x-correlation-id'] as string | undefined;
    const cid = correlationId ? ` [cid=${correlationId}]` : '';
    const start = Date.now();

    this.logger.log(`--> ${method} ${originalUrl}${cid}`);

    return next.handle().pipe(
      tap({
        next: () => {
          const ms = Date.now() - start;
          this.logger.log(
            `<-- ${method} ${originalUrl} ${res.statusCode} (${ms}ms)${cid}`,
          );
        },
        error: (err) => {
          const ms = Date.now() - start;
          const status = err?.status ?? 500;
          this.logger.error(
            `<-- ${method} ${originalUrl} ${status} (${ms}ms)${cid} — ${err?.message}`,
          );
        },
      }),
    );
  }
}
