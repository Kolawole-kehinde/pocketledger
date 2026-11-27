import { Injectable } from '@nestjs/common';

import {
  InvalidBalanceAccountConfigurationException,
  InvalidBalanceMovementException,
  InsufficientAvailableBalanceException,
} from '../errors/balance.errors.js';

import type {
  BalanceProjection,
  AggregatedAccountMovement,
  BalanceAccountContext,
} from '../types/balance.types.js';

@Injectable()
export class BalancePolicy {
  validateMovement(
    movement: AggregatedAccountMovement,
  ): void {
    if (
      movement.totalDebits < 0n ||
      movement.totalCredits < 0n
    ) {
      throw new InvalidBalanceMovementException(
        'Debit and credit totals cannot be negative.',
      );
    }

    if (
      movement.totalDebits === 0n &&
      movement.totalCredits === 0n
    ) {
      throw new InvalidBalanceMovementException(
        'Account movement cannot be zero.',
      );
    }
  }

  validateAccountConfiguration(
    account: BalanceAccountContext,
  ): void {
    const customerPurposes = [
      'SPENDABLE_WALLET',
      'LOCKED_SAVINGS',
    ] as const;

    const systemPurposes = [
      'SYSTEM_CLEARING',
      'SYSTEM_REVENUE',
      'SYSTEM_CASH',
    ] as const;

    const isValidCustomer =
      account.ownerType === 'CUSTOMER' &&
      customerPurposes.includes(account.accountPurpose as (typeof customerPurposes)[number]);

    const isValidSystem =
      account.ownerType === 'SYSTEM' &&
      systemPurposes.includes(account.accountPurpose as (typeof systemPurposes)[number]);

    if (!isValidCustomer && !isValidSystem) {
      throw new InvalidBalanceAccountConfigurationException(
        account.id,
      );
    }

    if (
      account.accountPurpose === 'SPENDABLE_WALLET' &&
      account.normalBalance !== 'DEBIT'
    ) {
      throw new InvalidBalanceAccountConfigurationException(
        account.id,
      );
    }
  }

  calculateNetDelta(
    account: BalanceAccountContext,
    movement: AggregatedAccountMovement,
  ): bigint {
    return account.normalBalance === 'DEBIT'
      ? movement.totalDebits - movement.totalCredits
      : movement.totalCredits - movement.totalDebits;
  }

  validateAvailableBalance(
    account: BalanceAccountContext,
    currentBalance: BalanceProjection,
    newPostedBalance: bigint,
  ): bigint {
    const newAvailableBalance =
      newPostedBalance - currentBalance.heldAmont;

    if (
      account.ownerType === 'CUSTOMER' &&
      account.accountPurpose === 'SPENDABLE_WALLET' &&
      newAvailableBalance < 0n
    ) {
      throw new InsufficientAvailableBalanceException(
        account.id,
      );
    }

    return newAvailableBalance;
  }
}