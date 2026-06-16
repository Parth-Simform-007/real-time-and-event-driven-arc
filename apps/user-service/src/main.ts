import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { LoggingInterceptor, ResponseInterceptor, AllExceptionsFilter } from '@ridewave/common';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('user-service');
  const app = await NestFactory.create(AppModule);

  const grpcPort = process.env.GRPC_PORT ?? 50051;
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'user',
      protoPath: join(process.cwd(), 'libs/proto/src/user.proto'),
      url: `127.0.0.1:${grpcPort}`,
    },
  });
  await app.startAllMicroservices();
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.useGlobalInterceptors(new LoggingInterceptor('user-service'), new ResponseInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.setGlobalPrefix('api');

  const swaggerConfig = new DocumentBuilder()
    .setTitle('RideWave — User Service')
    .setDescription('Authentication, JWT issuance, and user profiles')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swaggerConfig), {
    customSiteTitle: 'RideWave — User Service Docs',
  });
  const port = process.env.USER_PORT || 3001;
  await app.listen(port, '127.0.0.1');

  logger.log('========================================');
  logger.log('  User Service started');
  logger.log('========================================');
  logger.log(`  URL        : http://localhost:${port}/api`);
  logger.log(`  Docs       : http://localhost:${port}/docs`);
  logger.log(`  gRPC       : 127.0.0.1:${grpcPort}`);
  logger.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.log(
    `  Database   : postgres://${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || 'ridewave_users'}`,
  );
  logger.log('========================================');
}
bootstrap();
