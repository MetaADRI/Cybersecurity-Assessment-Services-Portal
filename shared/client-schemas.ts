import { z } from 'zod';
import { FREE_SERVICE_KEYS } from './free-services';

const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(254);
const password = z.string().min(10, 'Password must be at least 10 characters').max(200);
const code = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Enter the six-digit code');

export const publicFreeRunSchema = z
  .object({
    serviceKey: z.enum(FREE_SERVICE_KEYS),
    target: z.string().trim().max(20_000).optional(),
    consentConfirmed: z.boolean().default(false),
    fingerprintHash: z
      .string()
      .trim()
      .regex(/^[a-f0-9]{16,128}$/i, 'Invalid fingerprint')
      .optional(),
    answers: z.record(z.string(), z.string().max(40)).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.serviceKey === 'website_check' || value.serviceKey === 'email_check') {
      if (!value.target) {
        ctx.addIssue({ code: 'custom', path: ['target'], message: 'Enter a target to check' });
      }
      if (!value.consentConfirmed) {
        ctx.addIssue({
          code: 'custom',
          path: ['consentConfirmed'],
          message: 'Confirm that you own the target or are authorised to test it',
        });
      }
    }
    if (value.serviceKey === 'email_phishing_check') {
      if (!value.target || value.target.length < 40) {
        ctx.addIssue({
          code: 'custom',
          path: ['target'],
          message: 'Paste the full suspicious email text or headers to analyse',
        });
      }
    }
    if (value.serviceKey === 'subnet_calculator' && !value.target) {
      ctx.addIssue({
        code: 'custom',
        path: ['target'],
        message: 'Enter an IPv4 address with a prefix length',
      });
    }
    if (
      (value.serviceKey === 'hygiene_assessment' || value.serviceKey === 'phishing_quiz') &&
      (!value.answers || Object.keys(value.answers).length === 0)
    ) {
      ctx.addIssue({ code: 'custom', path: ['answers'], message: 'Answer the questions first' });
    }
  });
export type PublicFreeRunInput = z.infer<typeof publicFreeRunSchema>;

export const clientSignupSchema = z
  .object({
    name: z.string().trim().min(2, 'Enter your full name').max(160),
    company: z.string().trim().min(2, 'Enter your organisation').max(160),
    email,
    phone: z.string().trim().min(7, 'Enter a contact number').max(60),
    password,
    confirmPassword: z.string().min(1, 'Confirm your password'),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });
export type ClientSignupInput = z.infer<typeof clientSignupSchema>;

export const clientVerifySchema = z.object({ email, code });
export type ClientVerifyInput = z.infer<typeof clientVerifySchema>;

export const clientLoginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required').max(200),
});
export type ClientLoginInput = z.infer<typeof clientLoginSchema>;

export const clientProfileSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  company: z.string().trim().min(2).max(160).optional(),
  phone: z.string().trim().min(7).max(60).optional(),
});
export type ClientProfileInput = z.infer<typeof clientProfileSchema>;

export const serviceRequestCreateSchema = z.object({
  serviceKey: z.string().trim().min(2).max(80),
  message: z.string().trim().max(2000).optional().or(z.literal('')),
  contactPreference: z.enum(['email', 'phone', 'whatsapp']).default('email'),
});
export type ServiceRequestCreateInput = z.infer<typeof serviceRequestCreateSchema>;

export const serviceRequestUpdateSchema = z.object({
  status: z.enum(['new', 'contacted', 'in_progress', 'closed']).optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  staffNote: z.string().trim().max(1000).optional().or(z.literal('')),
});
export type ServiceRequestUpdateInput = z.infer<typeof serviceRequestUpdateSchema>;

export const freeRunQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
