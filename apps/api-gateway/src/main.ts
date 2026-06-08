import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { LoggingInterceptor } from '@ridewave/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.useGlobalInterceptors(new LoggingInterceptor('api-gateway'));
  app.setGlobalPrefix('api');

  const swaggerConfig = new DocumentBuilder()
    .setTitle('RideWave — API Gateway')
    .setDescription('Single entry point; routes to downstream services')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup(
    'docs',
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
    { customSiteTitle: 'RideWave — API Gateway Docs' },
  );
  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log('========================================');
  console.log('  API Gateway started');
  console.log('========================================');
  console.log(`  URL        : http://localhost:${port}/api`);
  console.log(`  Docs       : http://localhost:${port}/docs`);
  console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('========================================'); 
}
bootstrap();
