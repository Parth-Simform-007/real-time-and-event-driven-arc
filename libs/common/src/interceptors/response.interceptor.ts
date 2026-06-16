import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Response } from 'express';

export interface ApiResponse<T> {
  success: true;
  statusCode: number;
  data: T;
  timestamp: string;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T>> {
    if (context.getType() !== 'http') return next.handle() as any;

    const res = context.switchToHttp().getResponse<Response>();

    return next.handle().pipe(
      map((data) => ({
        success: true as const,
        statusCode: res.statusCode,
        data,
        timestamp: new Date().toISOString(),
      })),
    );
  }
}
