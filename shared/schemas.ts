import { z } from 'zod';
import {
  ASSESSMENT_STATUSES,
  ASSESSMENT_TYPES,
  BUSINESS_IMPACT,
  CONTROL_STATUSES,
  EXPLOITABILITY,
  EXPOSURE,
  FINDING_STATUSES,
  PRIORITIES,
  REPORT_TYPES,
  ROLES,
  SEVERITIES,
} from './constants';

const id = z.string().uuid();
const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a date in YYYY-MM-DD format')
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid date');

export const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1, 'Password is required').max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(10, 'New password must be at least 10 characters').max(200),
    confirmPassword: z.string().min(1),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

export const customerSchema = z.object({
  name: z.string().trim().min(2, 'Organization name is required').max(160),
  description: z.string().trim().max(2000).optional().or(z.literal('')),
  industry: z.string().trim().min(1, 'Industry is required').max(120),
  contactName: z.string().trim().max(160).optional().or(z.literal('')),
  contactEmail: z
    .union([z.literal(''), z.string().email('Enter a valid email address')])
    .optional()
    .or(z.literal('')),
  phone: z.string().trim().max(60).optional().or(z.literal('')),
  scope: z.string().trim().max(4000).optional().or(z.literal('')),
});
export type CustomerInput = z.infer<typeof customerSchema>;

export const assessmentSchema = z.object({
  customerId: id,
  title: z.string().trim().min(3, 'Title is required').max(200),
  type: z.enum(ASSESSMENT_TYPES),
  scope: z.string().trim().min(3, 'Scope is required').max(4000),
  description: z.string().trim().max(4000).optional().or(z.literal('')),
  assessmentDate: dateString,
  assessor: z.string().trim().min(2, 'Assessor is required').max(160),
  status: z.enum(ASSESSMENT_STATUSES).default('draft'),
});
export type AssessmentInput = z.infer<typeof assessmentSchema>;

export const controlAssessmentSchema = z.object({
  status: z.enum(CONTROL_STATUSES),
  justification: z.string().trim().max(1000).optional().or(z.literal('')),
  evidenceNotes: z.string().trim().max(4000).optional().or(z.literal('')),
  evidenceRef: z.string().trim().max(500).optional().or(z.literal('')),
});
export type ControlAssessmentInput = z.infer<typeof controlAssessmentSchema>;

const priorityFactors = {
  exploitability: z.enum(EXPLOITABILITY).default('unknown'),
  exposure: z.enum(EXPOSURE).default('unknown'),
  businessImpact: z.enum(BUSINESS_IMPACT).default('unknown'),
  compensatingControls: z.string().trim().max(1000).optional().or(z.literal('')),
};

export const findingBaseSchema = z.object({
  customerId: id,
  assessmentId: id.nullable().optional(),
  title: z.string().trim().min(3, 'Title is required').max(240),
  description: z.string().trim().min(3, 'Description is required').max(8000),
  asset: z.string().trim().max(240).optional().or(z.literal('')),
  component: z.string().trim().max(240).optional().or(z.literal('')),
  severity: z.enum(SEVERITIES),
  priority: z.enum(PRIORITIES).optional(),
  priorityJustification: z.string().trim().max(1000).optional().or(z.literal('')),
  evidence: z.string().trim().max(8000).optional().or(z.literal('')),
  discoveredDate: dateString,
  assigneeId: id.nullable().optional(),
  recommendedRemediation: z.string().trim().max(4000).optional().or(z.literal('')),
  targetDate: z
    .union([dateString, z.literal('')])
    .nullable()
    .optional(),
  externalRef: z.string().trim().max(120).optional().or(z.literal('')),
  ...priorityFactors,
});

export const findingSchema = findingBaseSchema.refine(
  (f) => f.priority === undefined || f.priorityJustification,
  {
    path: ['priorityJustification'],
    message: 'A justification is required when overriding the calculated priority',
  },
);
export type FindingInput = z.infer<typeof findingSchema>;

export const statusChangeSchema = z.object({
  status: z.enum(FINDING_STATUSES),
  note: z.string().trim().max(2000).optional().or(z.literal('')),
  resolutionNotes: z.string().trim().max(4000).optional().or(z.literal('')),
  verificationEvidence: z.string().trim().max(4000).optional().or(z.literal('')),
  riskJustification: z.string().trim().max(4000).optional().or(z.literal('')),
  riskDecisionMaker: z.string().trim().max(160).optional().or(z.literal('')),
  riskReviewDate: z
    .union([dateString, z.literal('')])
    .nullable()
    .optional(),
});

export const remediationUpdateSchema = z.object({
  assigneeId: id.nullable().optional(),
  targetDate: z
    .union([dateString, z.literal('')])
    .nullable()
    .optional(),
  recommendedRemediation: z.string().trim().max(4000).optional().or(z.literal('')),
  evidence: z.string().trim().max(8000).optional().or(z.literal('')),
});

export const progressNoteSchema = z.object({
  body: z.string().trim().min(2, 'Progress note is required').max(4000),
});

export const reportRequestSchema = z.object({
  assessmentId: id,
  type: z.enum(REPORT_TYPES),
  title: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(4000).optional(),
});

export const createUserSchema = z.object({
  email: z.string().email().max(254),
  fullName: z.string().trim().min(2, 'Name is required').max(160),
  role: z.enum(ROLES),
  password: z.string().min(10, 'Password must be at least 10 characters').max(200),
});

export const updateUserSchema = z.object({
  fullName: z.string().trim().min(2).max(160).optional(),
  role: z.enum(ROLES).optional(),
  status: z.enum(['active', 'disabled']).optional(),
  password: z.string().min(10).max(200).optional(),
});

export const categoryWeightsSchema = z.object({
  weights: z.record(z.string(), z.number().int().min(0).max(100)),
  coverageThreshold: z.number().int().min(0).max(100),
  rubric: z.object({
    effective: z.number().int().min(0).max(100),
    partially_effective: z.number().int().min(0).max(100),
    ineffective: z.number().int().min(0).max(100),
  }),
});

export const controlLibrarySchema = z.object({
  name: z.string().trim().min(3).max(200),
  description: z.string().trim().min(3).max(2000),
  guidance: z.string().trim().max(2000),
  rubric: z.string().trim().max(2000),
  applicability: z.string().trim().max(2000),
  evidenceRequirements: z.string().trim().max(2000),
  weight: z.number().int().min(1).max(100),
  active: z.boolean(),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().max(60).optional(),
  dir: z.enum(['asc', 'desc']).default('desc'),
  q: z.string().max(200).optional(),
});

export const findingsQuerySchema = paginationSchema.extend({
  customerId: id.optional(),
  assessmentId: id.optional(),
  severity: z.enum(SEVERITIES).optional(),
  status: z.enum(FINDING_STATUSES).optional(),
  assigneeId: id.optional(),
  overdue: z.enum(['true', 'false']).optional(),
});

export const idParamSchema = z.object({ id: id });
