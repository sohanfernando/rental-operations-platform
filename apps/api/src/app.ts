import 'reflect-metadata';
import { type NestApplicationOptions, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { type AppEnvironment } from './config';
import { ApiExceptionFilter } from './api-exception.filter';
import { requestLog } from './request-log';

export async function createApp(environment: AppEnvironment, options?: NestApplicationOptions) {
  const app = await NestFactory.create(AppModule.configure(environment), options);
  app.setGlobalPrefix('api/v1');
  app.use(requestLog);
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }));

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Rental Operations Platform')
    .setDescription('REST API for a single-location equipment rental business.')
    .setVersion('1.0')
    .addCookieAuth(
      environment.NODE_ENV === 'production' ? '__Host-rental_session' : 'rental_session',
      { type: 'apiKey', in: 'cookie' },
      'session',
    )
    .build();

  SwaggerModule.setup('docs', app, () => SwaggerModule.createDocument(app, swaggerConfig), {
    useGlobalPrefix: true,
  });

  return app;
}
