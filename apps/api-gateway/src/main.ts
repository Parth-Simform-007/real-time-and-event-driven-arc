import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { LoggingInterceptor, ResponseInterceptor, AllExceptionsFilter } from '@ridewave/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('api-gateway');
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.useGlobalInterceptors(new LoggingInterceptor('api-gateway'), new ResponseInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.setGlobalPrefix('api');

  const swaggerConfig = new DocumentBuilder()
    .setTitle('RideWave — API Gateway')
    .setDescription('Single entry point; routes to downstream services')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swaggerConfig), {
    customSiteTitle: 'RideWave — API Gateway Docs',
  });
  const port = process.env.PORT || 3000;
  await app.listen(port);

  logger.log('========================================');
  logger.log('  API Gateway started');
  logger.log('========================================');
  logger.log(`  URL        : http://localhost:${port}/api`);
  logger.log(`  Docs       : http://localhost:${port}/docs`);
  logger.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.log('========================================');
}
bootstrap();
