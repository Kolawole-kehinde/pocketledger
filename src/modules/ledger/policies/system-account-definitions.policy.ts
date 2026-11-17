
import type {
  ChartOfAccounts,
  SystemAccountDefinitions,
} from '../../../infrastructure/database/schema/index.js';

type SystemAccountDefinitionInput = Pick<
  SystemAccountDefinitions,
  'code' | 'name' | 'allowNegativeBalance'
>;

type SystemAccountChartAccountInput = Pick<
  ChartOfAccounts,
  | 'isActive'
  | 'isContraAccount'
  | 'accountType'
  | 'normalBalance'
> & {
  hasChildren: boolean;
};

export interface SystemAccountDefinitionsPolicyResult {
  valid: boolean;
  code: string | null;
  reason: string | null;
}

export const systemAccountDefinitionsPolicy = (
  definition: SystemAccountDefinitionInput,
  chartAccount: SystemAccountChartAccountInput,
): SystemAccountDefinitionsPolicyResult => {
    
  const normalizedCode = definition.code.trim();
  const normalizedName = definition.name.trim();

  if (!normalizedCode) {
    return {
      valid: false,
      code: 'SYSTEM_ACCOUNT_CODE_REQUIRED',
      reason: 'System account code cannot be empty.',
    };
  }

  if (normalizedCode.length > 50) {
    return {
      valid: false,
      code: 'SYSTEM_ACCOUNT_CODE_TOO_LONG',
      reason: 'System account code cannot exceed 50 characters.',
    };
  }

  if (!/^[A-Z][A-Z0-9_]*$/.test(normalizedCode)) {
    return {
      valid: false,
      code: 'INVALID_SYSTEM_ACCOUNT_CODE_FORMAT',
      reason:
        'System account code must start with an uppercase letter and contain only uppercase letters, numbers, and underscores.',
    };
  }

  if (!normalizedName) {
    return {
      valid: false,
      code: 'SYSTEM_ACCOUNT_NAME_REQUIRED',
      reason: 'System account name cannot be empty.',
    };
  }

  if (normalizedName.length > 100) {
    return {
      valid: false,
      code: 'SYSTEM_ACCOUNT_NAME_TOO_LONG',
      reason: 'System account name cannot exceed 100 characters.',
    };
  }

  if (!chartAccount.isActive) {
    return {
      valid: false,
      code: 'CHART_ACCOUNT_INACTIVE',
      reason: 'System account must reference an active chart account.',
    };
  }

  if (chartAccount.hasChildren) {
    return {
      valid: false,
      code: 'CHART_ACCOUNT_NOT_LEAF',
      reason: 'System account must reference a leaf-level chart account.',
    };
  }

  if (chartAccount.isContraAccount) {
    return {
      valid: false,
      code: 'CONTRA_ACCOUNT_NOT_ALLOWED',
      reason:
        'System account definitions cannot reference contra chart accounts.',
    };
  }

  return {
    valid: true,
    code: null,
    reason: null,
  };
};
