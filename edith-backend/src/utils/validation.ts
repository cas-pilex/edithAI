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

// ==================== TASK FILTER SCHEMAS ====================

export const taskFiltersSchema = z.object({
  status: z.enum(['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  tags: z.string().transform(s => s.split(',')).optional(),
  dueBefore: z.string().datetime().optional(),
  dueAfter: z.string().datetime().optional(),
  source: z.enum(['MANUAL', 'EMAIL', 'MEETING', 'AI']).optional(),
});

export const bulkTasksSchema = z.object({
  action: z.enum(['complete', 'delete', 'updatePriority', 'addTag']),
  taskIds: z.array(z.string().uuid()).min(1).max(100),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  tag: z.string().max(50).optional(),
});

// ==================== INBOX SCHEMAS ====================

export const inboxFiltersSchema = z.object({
  category: z.enum(['URGENT', 'ACTION_REQUIRED', 'FOLLOW_UP', 'FYI', 'NEWSLETTER', 'SPAM']).optional(),
  isRead: z.string().transform(s => s === 'true').optional(),
  isArchived: z.string().transform(s => s === 'true').optional(),
  fromAddress: z.string().email().optional(),
  search: z.string().max(200).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export const updateEmailCategorySchema = z.object({
  category: z.enum(['URGENT', 'ACTION_REQUIRED', 'FOLLOW_UP', 'FYI', 'NEWSLETTER', 'SPAM']),
});

export const starEmailSchema = z.object({
  starred: z.boolean(),
});

export const bulkEmailsSchema = z.object({
  action: z.enum(['archive', 'markRead', 'markUnread', 'delete', 'updateCategory']),
  emailIds: z.array(z.string().uuid()).min(1).max(100),
  category: z.enum(['URGENT', 'ACTION_REQUIRED', 'FOLLOW_UP', 'FYI', 'NEWSLETTER', 'SPAM']).optional(),
});

export const draftReplySchema = z.object({
  tone: z.string().optional(),
  includeQuote: z.boolean().optional(),
});

export const sendReplySchema = z.object({
  body: z.string().min(1, 'Reply body is required'),
  isHtml: z.boolean().optional(),
});

export const sendEmailSchema = z.object({
  to: z.array(z.string().email()).min(1),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
  subject: z.string().min(1),
  body: z.string().min(1),
  isHtml: z.boolean().optional(),
});

// ==================== CALENDAR SCHEMAS ====================

export const calendarFiltersSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  isOnline: z.string().transform(s => s === 'true').optional(),
  status: z.enum(['CONFIRMED', 'TENTATIVE', 'CANCELLED']).optional(),
});

export const createEventSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  timezone: z.string().default('UTC'),
  location: z.string().max(500).optional(),
  isOnline: z.boolean().default(false),
  meetingUrl: z.string().url().optional(),
  recurrenceRule: z.string().max(500).optional(),
  attendees: z.array(z.object({
    email: z.string().email(),
    name: z.string().max(100).optional(),
    isOrganizer: z.boolean().optional(),
  })).optional(),
});

export const updateEventSchema = createEventSchema.partial();

export const rsvpSchema = z.object({
  status: z.enum(['ACCEPTED', 'DECLINED', 'TENTATIVE']),
  comment: z.string().max(500).optional(),
});

export const availabilityQuerySchema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  duration: z.string().transform(Number).default('30'),
  bufferMinutes: z.string().transform(Number).optional(),
});

export const findTimeSchema = z.object({
  attendees: z.array(z.string().email()).min(1).max(20),
  duration: z.number().min(15).max(480),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  preferredTimes: z.array(z.object({
    start: z.string(), // "09:00"
    end: z.string(),   // "17:00"
  })).optional(),
});

// ==================== CRM SCHEMAS ====================

export const contactFiltersSchema = z.object({
  search: z.string().max(200).optional(),
  company: z.string().max(200).optional(),
  interests: z.string().transform(s => s.split(',')).optional(),
  minImportance: z.string().transform(Number).optional(),
  relationshipType: z.enum(['LEAD', 'CLIENT', 'PARTNER', 'INVESTOR', 'MENTOR', 'FRIEND', 'FAMILY', 'OTHER']).optional(),
});

export const updateContactSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().max(20).optional(),
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  company: z.string().max(200).optional(),
  jobTitle: z.string().max(200).optional(),
  linkedinUrl: z.string().url().optional(),
  relationshipType: z.enum(['LEAD', 'CLIENT', 'PARTNER', 'INVESTOR', 'MENTOR', 'FRIEND', 'FAMILY', 'OTHER']).optional(),
  importanceScore: z.number().min(1).max(10).optional(),
  notes: z.string().max(5000).optional(),
  birthday: z.string().datetime().optional(),
  anniversary: z.string().datetime().optional(),
  interests: z.array(z.string().max(50)).max(20).optional(),
});

export const addInteractionSchema = z.object({
  type: z.enum(['EMAIL_SENT', 'EMAIL_RECEIVED', 'MEETING', 'CALL', 'MESSAGE', 'NOTE']),
  summary: z.string().max(2000).optional(),
  sentiment: z.enum(['POSITIVE', 'NEUTRAL', 'NEGATIVE']).optional(),
  date: z.string().datetime().optional(),
});

export const manageTagsSchema = z.object({
  action: z.enum(['add', 'remove', 'set']),
  tags: z.array(z.string().max(50)).min(1).max(20),
});

export const setFollowUpSchema = z.object({
  type: z.string().max(100),
  dueDate: z.string().datetime(),
  message: z.string().max(500).optional(),
});

// ==================== EXPENSE SCHEMAS ====================

export const expenseFiltersSchema = z.object({
  category: z.enum(['TRAVEL', 'MEALS', 'ACCOMMODATION', 'TRANSPORT', 'SOFTWARE', 'OTHER']).optional(),
  status: z.enum(['PENDING', 'CATEGORIZED', 'APPROVED', 'REIMBURSED']).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  minAmount: z.string().transform(Number).optional(),
  maxAmount: z.string().transform(Number).optional(),
  tripId: z.string().uuid().optional(),
});

export const createExpenseSchema = z.object({
  description: z.string().min(1).max(500),
  amount: z.number().positive(),
  currency: z.string().length(3).default('EUR'),
  category: z.enum(['TRAVEL', 'MEALS', 'ACCOMMODATION', 'TRANSPORT', 'SOFTWARE', 'OTHER']),
  date: z.string().datetime(),
  vendor: z.string().max(200).optional(),
  receiptUrl: z.string().url().optional(),
  tripId: z.string().uuid().optional(),
});

export const updateExpenseSchema = createExpenseSchema.partial().omit({ tripId: true });

export const expenseReportSchema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  groupBy: z.enum(['category', 'month', 'trip']).optional(),
  format: z.enum(['json', 'csv', 'pdf']).optional(),
});

// ==================== TRAVEL SCHEMAS ====================

export const tripFiltersSchema = z.object({
  status: z.enum(['PLANNING', 'BOOKED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  destination: z.string().max(500).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export const updateTripSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  destination: z.string().min(1).max(500).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  purpose: z.string().max(500).optional(),
  totalBudget: z.number().min(0).optional(),
  currency: z.string().length(3).optional(),
  notes: z.string().max(5000).optional(),
  status: z.enum(['PLANNING', 'BOOKED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
});

export const createBookingSchema = z.object({
  tripId: z.string().uuid(),
  type: z.enum(['FLIGHT', 'HOTEL', 'RESTAURANT', 'CAR', 'TRAIN', 'OTHER']),
  provider: z.string().max(200).optional(),
  confirmationNumber: z.string().max(100).optional(),
  details: z.record(z.unknown()).optional(),
  startDateTime: z.string().datetime(),
  endDateTime: z.string().datetime(),
  price: z.number().min(0).optional(),
  currency: z.string().length(3).optional(),
  status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED']).optional(),
});

export const flightSearchSchema = z.object({
  origin: z.string().length(3), // IATA code
  destination: z.string().length(3),
  departureDate: z.string().datetime(),
  returnDate: z.string().datetime().optional(),
  passengers: z.number().int().min(1).max(9).optional(),
  cabinClass: z.enum(['economy', 'premium_economy', 'business', 'first']).optional(),
});

export const hotelSearchSchema = z.object({
  destination: z.string().min(1).max(200),
  checkIn: z.string().datetime(),
  checkOut: z.string().datetime(),
  guests: z.number().int().min(1).max(10).optional(),
  rooms: z.number().int().min(1).max(5).optional(),
  stars: z.number().int().min(1).max(5).optional(),
});

// ==================== DASHBOARD SCHEMAS ====================

export const dashboardFiltersSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export const dateRangeSchema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
});

export const reportExportSchema = z.object({
  type: z.enum(['weekly', 'monthly', 'custom']),
  format: z.enum(['json', 'csv', 'pdf']),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

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

// New route input types
export type TaskFiltersInput = z.infer<typeof taskFiltersSchema>;
export type BulkTasksInput = z.infer<typeof bulkTasksSchema>;
export type InboxFiltersInput = z.infer<typeof inboxFiltersSchema>;
export type UpdateEmailCategoryInput = z.infer<typeof updateEmailCategorySchema>;
export type BulkEmailsInput = z.infer<typeof bulkEmailsSchema>;
export type DraftReplyInput = z.infer<typeof draftReplySchema>;
export type CalendarFiltersInput = z.infer<typeof calendarFiltersSchema>;
export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type RsvpInput = z.infer<typeof rsvpSchema>;
export type AvailabilityQueryInput = z.infer<typeof availabilityQuerySchema>;
export type FindTimeInput = z.infer<typeof findTimeSchema>;
export type ContactFiltersInput = z.infer<typeof contactFiltersSchema>;
export type UpdateContactInput = z.infer<typeof updateContactSchema>;
export type AddInteractionInput = z.infer<typeof addInteractionSchema>;
export type ManageTagsInput = z.infer<typeof manageTagsSchema>;
export type SetFollowUpInput = z.infer<typeof setFollowUpSchema>;
export type ExpenseFiltersInput = z.infer<typeof expenseFiltersSchema>;
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
export type ExpenseReportInput = z.infer<typeof expenseReportSchema>;
export type TripFiltersInput = z.infer<typeof tripFiltersSchema>;
export type UpdateTripInput = z.infer<typeof updateTripSchema>;
export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type FlightSearchInput = z.infer<typeof flightSearchSchema>;
export type HotelSearchInput = z.infer<typeof hotelSearchSchema>;
export type DashboardFiltersInput = z.infer<typeof dashboardFiltersSchema>;
export type DateRangeInput = z.infer<typeof dateRangeSchema>;
export type ReportExportInput = z.infer<typeof reportExportSchema>;
