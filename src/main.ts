import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app/app.module.js';
import { setupSwagger } from './config/swagger.config.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.use(cookieParser());
  app.enableShutdownHooks();

  const swaggerPath = setupSwagger(app, configService);
  const port = configService.getOrThrow<number>('PORT');

  await app.listen(port);

  if (swaggerPath) {
    Logger.log(
      `OpenAPI docs available at http://localhost:${port}/${swaggerPath}`,
      'Bootstrap',
    );
  }
}

void bootstrap();
