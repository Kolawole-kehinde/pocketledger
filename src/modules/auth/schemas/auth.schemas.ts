import { z } from 'zod';

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email().max(255));

export const registerSchema = z
  .object({
    email: emailSchema,
  })
  .strict();

export const loginSchema = registerSchema;

export const verifyOtpSchema = z
  .object({
    email: emailSchema,
    otp: z.string().regex(/^\d{6}$/, 'OTP must be exactly 6 digits'),
  })
  .strict();

export const completeRegistrationSchema = z
  .object({
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    middleName: z.string().trim().max(100).nullable().optional(),
    username: z
      .string()
      .trim()
      .min(3)
      .max(30)
      .regex(/^[a-zA-Z0-9_.-]+$/),
    phoneNumber: z
      .string()
      .trim()
      .regex(/^\+?[0-9]{7,20}$/),
  })
  .strict();

export const sessionIdParamSchema = z
  .string()
  .uuid('Session id must be a valid UUID');

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type CompleteRegistrationInput = z.infer<
  typeof completeRegistrationSchema
>;
