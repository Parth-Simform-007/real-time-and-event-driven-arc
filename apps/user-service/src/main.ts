import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { LoggingInterceptor, ResponseInterceptor, AllExceptionsFilter } from '@ridewave/common';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const grpcPort = process.env.GRPC_PORT ?? 50051;
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'user',
      protoPath: join(process.cwd(), 'libs/proto/src/user.proto'),
      url: `0.0.0.0:${grpcPort}`,
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
  await app.listen(port);

  console.log('========================================');
  console.log('  User Service started');
  console.log('========================================');
  console.log(`  URL        : http://localhost:${port}/api`);
  console.log(`  Docs       : http://localhost:${port}/docs`);
  console.log(`  gRPC       : 0.0.0.0:${grpcPort}`);
  console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(
    `  Database   : postgres://${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || 'ridewave_users'}`,
  );
  console.log('========================================');
}
bootstrap();
