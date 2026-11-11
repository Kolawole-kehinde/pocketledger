import { z } from 'zod';

export const userIdParamSchema = z
  .string()
  .uuid('User id must be a valid UUID');

export const updateUserRoleSchema = z
  .object({
    role: z.enum(['customer', 'support', 'admin']),
  })
  .strict();

export const updateUserStatusSchema = z
  .object({
    status: z.enum([
      'pending_verification',
      'active',
      'suspended',
      'closed',
    ]),
  })
  .strict();

export type UpdateUserRoleInput = z.infer<
  typeof updateUserRoleSchema
>;

export type UpdateUserStatusInput = z.infer<
  typeof updateUserStatusSchema
>;
