
import { Module } from '@nestjs/common';
import { databaseProviders } from './database.provider.js';

@Module({
  providers: [...databaseProviders],
  exports: [...databaseProviders],
})
export class DatabaseModule {}
