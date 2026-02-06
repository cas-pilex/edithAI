import { z } from 'zod';

// ==================== AUTH SCHEMAS ====================

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
  name: z.string().min(1).max(100).optional(),
  timezone: z.string().default('UTC'),
  locale: z.string().default('en'),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
});

// ==================== USER SCHEMAS ====================

export const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  timezone: z.string().optional(),
  locale: z.string().optional(),
});

export const updatePreferencesSchema = z.object({
  // Communication
  preferredChannel: z.enum(['EMAIL', 'TELEGRAM', 'WHATSAPP', 'SLACK']).optional(),
  quietHoursStart: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
  quietHoursEnd: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
  digestFrequency: z.enum(['REALTIME', 'HOURLY', 'DAILY']).optional(),
  language: z.string().min(2).max(5).optional(),

  // Work
  workingHoursStart: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
  workingHoursEnd: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
  workingDays: z.array(z.number().min(0).max(6)).optional(),
  focusBlockDuration: z.number().min(15).max(240).optional(),
  meetingBufferMinutes: z.number().min(0).max(60).optional(),
  maxMeetingsPerDay: z.number().min(1).max(20).optional(),

  // Style
  communicationTone: z.enum(['FORMAL', 'CASUAL', 'MIXED']).optional(),
  emailSignature: z.string().max(500).optional(),
  responseLength: z.enum(['CONCISE', 'DETAILED']).optional(),

  // Travel
  preferredAirlines: z.array(z.string()).optional(),
  seatPreference: z.enum(['window', 'aisle', 'middle']).optional(),
  hotelStars: z.number().min(1).max(5).optional(),
  dietaryRestrictions: z.string().max(200).optional(),
  loyaltyPrograms: z.record(z.string()).optional(),

  // Privacy
  dataRetentionDays: z.number().min(30).max(730).optional(),
  allowAnalytics: z.boolean().optional(),
  marketingEmails: z.boolean().optional(),
});

// ==================== INTEGRATION SCHEMAS ====================

export const integrationProviderSchema = z.enum([
  'GMAIL',
  'GOOGLE_CALENDAR',
  'SLACK',
  'TELEGRAM',
  'WHATSAPP',
]);

export const oauthCallbackSchema = z.object({
  code: z.string().min(1),
  state: z.string().optional(),
});

// ==================== TASK SCHEMAS ====================

export const createTaskSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  dueDate: z.string().datetime().optional(),
  estimatedMinutes: z.number().min(1).max(480).optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(5000).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE']).optional(),
  dueDate: z.string().datetime().nullable().optional(),
  estimatedMinutes: z.number().min(1).max(480).optional(),
  actualMinutes: z.number().min(0).optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
});

// ==================== CONTACT SCHEMAS ====================

export const createContactSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().max(20).optional(),
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  company: z.string().max(200).optional(),
  jobTitle: z.string().max(200).optional(),
  linkedinUrl: z.string().url().optional(),
  relationshipType: z.enum([
    'LEAD', 'CLIENT', 'PARTNER', 'INVESTOR', 'MENTOR', 'FRIEND', 'FAMILY', 'OTHER'
  ]).default('OTHER'),
  importanceScore: z.number().min(1).max(10).default(5),
  notes: z.string().max(5000).optional(),
  birthday: z.string().datetime().optional(),
  anniversary: z.string().datetime().optional(),
});

// ==================== TRIP SCHEMAS ====================

export const createTripSchema = z.object({
  name: z.string().min(1).max(200),
  destination: z.string().min(1).max(500),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  purpose: z.string().max(500).optional(),
  totalBudget: z.number().min(0).optional(),
  currency: z.string().length(3).default('USD'),
  notes: z.string().max(5000).optional(),
});

// ==================== PAGINATION SCHEMA ====================

export const paginationSchema = z.object({
  page: z.string().transform(Number).default('1'),
  limit: z.string().transform(Number).default('20'),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// ==================== UUID SCHEMA ====================

export const uuidSchema = z.string().uuid('Invalid ID format');

// ==================== HELPER FUNCTIONS ====================

export function validateRequest<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

export function safeValidateRequest<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; errors: z.ZodError } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error };
}

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type CreateContactInput = z.infer<typeof createContactSchema>;
export type CreateTripInput = z.infer<typeof createTripSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
