import { Module } from '@nestjs/common';
import { BalanceRepository } from './repositories/balance.repository.js';
import { BalancePolicy } from './policies/balance.policy.js';
import { BalanceService } from './services/balance.service.js';


@Module({
  providers: [
    BalanceRepository,
    BalancePolicy,
    BalanceService,
  ],
  exports: [
    BalanceService,
  ],
})
export class LedgerModule {}