import { z } from 'zod';

import { ROLE_VALUES } from '../../authorization/roles.js';

export const userListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().min(1).max(255).optional(),
    role: z.enum(ROLE_VALUES).optional(),
    status: z
      .enum([
        'pending_verification',
        'active',
        'inactive',
        'suspended',
        'closed',
      ])
      .optional(),
    sortBy: z
      .enum(['createdAt', 'firstName', 'lastName', 'email'])
      .default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
    createdFrom: z.iso.datetime({ offset: true }).optional(),
    createdTo: z.iso.datetime({ offset: true }).optional(),
  })
  .strict()
  .refine(
    (query) =>
      !query.createdFrom ||
      !query.createdTo ||
      new Date(query.createdFrom) <= new Date(query.createdTo),
    {
      message: '`createdFrom` must be earlier than or equal to `createdTo`.',
      path: ['createdFrom'],
    },
  );

export type UserListQuery = z.infer<typeof userListQuerySchema>;
