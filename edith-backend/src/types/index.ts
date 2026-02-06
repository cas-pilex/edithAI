import type { Request } from 'express';
import type { User, UserPreferences } from '@prisma/client';

// ==================== AUTH TYPES ====================

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedRequest extends Request {
  user?: JWTPayload;
  userId?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResult {
  user: SafeUser;
  tokens: TokenPair;
}

// ==================== USER TYPES ====================

export type SafeUser = Omit<User, 'passwordHash'>;

export interface UserWithPreferences extends SafeUser {
  preferences: UserPreferences | null;
}

export interface CreateUserInput {
  email: string;
  password: string;
  name?: string;
  timezone?: string;
  locale?: string;
}

export interface UpdateUserInput {
  name?: string;
  timezone?: string;
  locale?: string;
}

export interface UpdatePreferencesInput {
  // Communication
  preferredChannel?: 'EMAIL' | 'TELEGRAM' | 'WHATSAPP' | 'SLACK';
  quietHoursStart?: string;
  quietHoursEnd?: string;
  digestFrequency?: 'REALTIME' | 'HOURLY' | 'DAILY';
  language?: string;

  // Work
  workingHoursStart?: string;
  workingHoursEnd?: string;
  workingDays?: number[];
  focusBlockDuration?: number;
  meetingBufferMinutes?: number;
  maxMeetingsPerDay?: number;

  // Style
  communicationTone?: 'FORMAL' | 'CASUAL' | 'MIXED';
  emailSignature?: string;
  responseLength?: 'CONCISE' | 'DETAILED';

  // Travel
  preferredAirlines?: string[];
  seatPreference?: string;
  hotelStars?: number;
  dietaryRestrictions?: string;
  loyaltyPrograms?: Record<string, string>;

  // Privacy
  dataRetentionDays?: number;
  allowAnalytics?: boolean;
  marketingEmails?: boolean;
}

// ==================== INTEGRATION TYPES ====================

export type IntegrationProvider = 'GMAIL' | 'GOOGLE_CALENDAR' | 'SLACK' | 'TELEGRAM' | 'WHATSAPP';

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scope?: string;
}

export interface IntegrationMetadata {
  email?: string;
  displayName?: string;
  [key: string]: unknown;
}

// ==================== EMAIL TYPES ====================

export interface EmailAttachment {
  filename: string;
  mimeType: string;
  size: number;
  attachmentId: string;
}

export interface ExtractedTask {
  title: string;
  dueDate?: string;
  priority?: string;
}

export interface ExtractedDate {
  date: string;
  description: string;
  type: string;
}

// ==================== CALENDAR TYPES ====================

export interface CalendarAttendee {
  email: string;
  name?: string;
  status: 'accepted' | 'declined' | 'tentative' | 'needsAction';
  organizer?: boolean;
}

export interface FocusTimeBlock {
  day: number; // 0-6 (Sun-Sat)
  start: string; // HH:mm
  end: string; // HH:mm
}

export interface PreferredMeetingTimes {
  morning: boolean;
  afternoon: boolean;
  evening: boolean;
}

// ==================== AI TYPES ====================

export interface AIAgentContext {
  userId: string;
  userEmail?: string;
  userName?: string;
  timezone?: string;
  preferences?: Record<string, unknown>;
  userPreferences?: UserPreferences;
  conversationHistory?: AIMessage[];
}

export interface AIMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AIAgentResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  confidence?: number;
  reasoning?: string;
}

export interface EmailAnalysis {
  priorityScore: number;
  category: string;
  summary: string;
  suggestedAction?: string;
  sentiment: string;
  extractedTasks: ExtractedTask[];
  extractedDates: ExtractedDate[];
}

// ==================== NOTIFICATION TYPES ====================

export interface NotificationPayload {
  userId: string;
  type: string;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
  channel?: 'IN_APP' | 'EMAIL' | 'TELEGRAM' | 'WHATSAPP' | 'SLACK';
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  scheduledFor?: Date;
}

// ==================== AUDIT TYPES ====================

export interface AuditContext {
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditEntry {
  action: string;
  resource: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}

// ==================== API RESPONSE TYPES ====================

export interface APIResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends APIResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  services: {
    database: ServiceStatus;
    redis: ServiceStatus;
    ai?: ServiceStatus;
  };
  uptime: number;
}

export interface ServiceStatus {
  status: 'connected' | 'disconnected' | 'error';
  latency?: number;
  error?: string;
}

// ==================== JOB TYPES ====================

export interface JobPayload {
  userId: string;
  [key: string]: unknown;
}

export interface MorningBriefingPayload extends JobPayload {
  date: string;
}

export interface InboxProcessorPayload extends JobPayload {
  emailIds?: string[];
  fullSync?: boolean;
}

export interface CalendarOptimizerPayload extends JobPayload {
  dateRange: {
    start: string;
    end: string;
  };
}

// ==================== RE-EXPORT AGENT TYPES ====================

export * from './agent.types.js';
