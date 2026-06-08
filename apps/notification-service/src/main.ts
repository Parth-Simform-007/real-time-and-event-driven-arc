import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { LoggingInterceptor } from '@ridewave/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.useGlobalInterceptors(new LoggingInterceptor('notification-service'));
  app.setGlobalPrefix('api');

  const swaggerConfig = new DocumentBuilder()
    .setTitle('RideWave — Notification Service')
    .setDescription('Pure event consumer; idempotent notification delivery')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup(
    'docs',
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
    { customSiteTitle: 'RideWave — Notification Service Docs' },
  );
  const port = process.env.NOTIFICATION_PORT || 3004;
  await app.listen(port);

  console.log('========================================');
  console.log('  Notification Service started');
  console.log('========================================');
  console.log(`  URL        : http://localhost:${port}/api`);
  console.log(`  Docs       : http://localhost:${port}/docs`);
  console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(
    `  Database   : postgres://${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || 'ridewave_notifications'}`,
  );
  console.log(
    `  RabbitMQ   : ${process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672'}`,
  );
  console.log('========================================');
}
bootstrap();
