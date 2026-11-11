import { z } from 'zod';

import {
  securityEventSeverityEnum,
  securityEventTypeEnum,
} from '../../../infrastructure/database/schema/security-events.schema.js';

export const securityEventListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    type: z.enum(securityEventTypeEnum.enumValues).optional(),
    severity: z.enum(securityEventSeverityEnum.enumValues).optional(),
    userId: z.string().uuid('User id must be a valid UUID').optional(),
    resolved: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .strict()
  .refine(
    (query) => !query.from || !query.to || query.from <= query.to,
    {
      message: '`from` must be before or equal to `to`',
      path: ['from'],
    },
  );

export type SecurityEventListQuery = z.infer<
  typeof securityEventListQuerySchema
>;

export const securityEventIdParamSchema = z
  .string()
  .uuid('Security event id must be a valid UUID');

export type SecurityEventIdParam = z.infer<
  typeof securityEventIdParamSchema
>;
