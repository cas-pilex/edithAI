export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  timezone?: string;
  locale?: string;
  role: string;
  isActive: boolean;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserPreferences {
  id: string;
  userId: string;
  communicationStyle: string;
  workHoursStart: string;
  workHoursEnd: string;
  workDays: number[];
  autoArchiveAfterDays: number;
  aiSuggestions: boolean;
  travelPreferences: {
    seatPreference?: string;
    mealPreference?: string;
    hotelStars?: number;
    loyaltyPrograms?: string[];
  };
  notificationPreferences: {
    email: boolean;
    push: boolean;
    slack: boolean;
    urgentOnly: boolean;
  };
}

export interface Email {
  id: string;
  userId: string;
  externalId?: string;
  threadId?: string;
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  snippet?: string;
  category: string;
  priority: string;
  isRead: boolean;
  isStarred: boolean;
  isArchived: boolean;
  isDraft: boolean;
  labels: string[];
  aiSummary?: string;
  aiCategory?: string;
  extractedTasks?: string[];
  sentAt?: string;
  receivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  userId: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  dueDate?: string;
  completedAt?: string;
  tags: string[];
  source?: string;
  sourceId?: string;
  estimatedMinutes?: number;
  actualMinutes?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CalendarEvent {
  id: string;
  userId: string;
  externalId?: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  location?: string;
  meetingUrl?: string;
  isAllDay: boolean;
  isRecurring: boolean;
  recurrenceRule?: string;
  status: string;
  attendees: EventAttendee[];
  reminders: number[];
  aiPrepNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EventAttendee {
  email: string;
  name?: string;
  status: string;
  isOrganizer: boolean;
}

export interface Contact {
  id: string;
  userId: string;
  email: string;
  name: string;
  company?: string;
  title?: string;
  phone?: string;
  avatar?: string;
  relationship: string;
  importance: number;
  tags: string[];
  notes?: string;
  lastContactedAt?: string;
  nextFollowUpAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Interaction {
  id: string;
  contactId: string;
  type: string;
  subject?: string;
  notes?: string;
  date: string;
  sentiment?: string;
  createdAt: string;
}

export interface Trip {
  id: string;
  userId: string;
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
  status: string;
  purpose?: string;
  budget?: number;
  totalSpent?: number;
  currency: string;
  notes?: string;
  bookings: Booking[];
  expenses: Expense[];
  createdAt: string;
  updatedAt: string;
}

export interface Booking {
  id: string;
  tripId: string;
  type: string;
  provider?: string;
  confirmationNumber?: string;
  status: string;
  startDate: string;
  endDate?: string;
  price?: number;
  currency: string;
  details: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Expense {
  id: string;
  userId: string;
  tripId?: string;
  amount: number;
  currency: string;
  category: string;
  description: string;
  vendor?: string;
  date: string;
  receiptUrl?: string;
  status: string;
  aiCategory?: string;
  aiConfidence?: number;
  approvedBy?: string;
  approvedAt?: string;
  reimbursedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Approval {
  id: string;
  userId: string;
  agentType: string;
  action: string;
  description: string;
  data: Record<string, unknown>;
  status: string;
  confidence: number;
  decidedAt?: string;
  modifiedData?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardData {
  stats: {
    timeSaved: { value: number; unit: string; trend: number };
    emailsProcessed: { value: number; trend: number };
    meetingsOptimized: { value: number; trend: number };
    tasksCompleted: { value: number; trend: number };
  };
  recentActivity: ActivityItem[];
  priorityEmails: Email[];
  upcomingEvents: CalendarEvent[];
  pendingApprovals: Approval[];
  productivity: ProductivityData[];
}

export interface ActivityItem {
  id: string;
  type: string;
  title: string;
  description?: string;
  timestamp: string;
  icon?: string;
}

export interface ProductivityData {
  date: string;
  tasks: number;
  emails: number;
  meetings: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  domain?: string;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  timestamp: string;
  data?: Record<string, unknown>;
}
