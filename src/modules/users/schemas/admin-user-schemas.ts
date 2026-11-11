import { z } from 'zod';

import { ALL_PERMISSIONS } from '../../authorization/permissions.js';
import { ROLE_VALUES } from '../../authorization/roles.js';

export const userIdParamSchema = z
  .string()
  .uuid('User id must be a valid UUID');

export const updateUserRoleSchema = z
  .object({
    role: z.enum(ROLE_VALUES),
  })
  .strict();

export const updateUserStatusSchema = z
  .object({
    status: z.enum([
      'pending_verification',
      'active',
      'inactive',
      'suspended',
      'closed',
    ]),
  })
  .strict();

export const permissionParamSchema = z.enum(ALL_PERMISSIONS);

export const permissionOverrideSchema = z
  .object({
    permission: permissionParamSchema,
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export type UpdateUserRoleInput = z.infer<
  typeof updateUserRoleSchema
>;

export type UpdateUserStatusInput = z.infer<
  typeof updateUserStatusSchema
>;

export type PermissionOverrideInput = z.infer<
  typeof permissionOverrideSchema
>;
