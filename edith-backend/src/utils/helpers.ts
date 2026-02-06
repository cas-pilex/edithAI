import type { Response } from 'express';
import type { APIResponse, PaginatedResponse } from '../types/index.js';

// ==================== API RESPONSE HELPERS ====================

export function sendSuccess<T>(
  res: Response,
  data: T,
  message?: string,
  statusCode: number = 200
): void {
  const response: APIResponse<T> = {
    success: true,
    data,
    message,
  };
  res.status(statusCode).json(response);
}

export function sendError(
  res: Response,
  error: string,
  statusCode: number = 400
): void {
  const response: APIResponse = {
    success: false,
    error,
  };
  res.status(statusCode).json(response);
}

export function sendPaginated<T>(
  res: Response,
  data: T[],
  page: number,
  limit: number,
  total: number
): void {
  const response: PaginatedResponse<T> = {
    success: true,
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
  res.status(200).json(response);
}

// ==================== DATE HELPERS ====================

export function parseTimeString(time: string): { hours: number; minutes: number } {
  const [hours, minutes] = time.split(':').map(Number);
  return { hours, minutes };
}

export function isWithinWorkingHours(
  date: Date,
  workingHoursStart: string,
  workingHoursEnd: string,
  workingDays: number[]
): boolean {
  const day = date.getDay();
  if (!workingDays.includes(day)) {
    return false;
  }

  const start = parseTimeString(workingHoursStart);
  const end = parseTimeString(workingHoursEnd);
  const hours = date.getHours();
  const minutes = date.getMinutes();

  const currentMinutes = hours * 60 + minutes;
  const startMinutes = start.hours * 60 + start.minutes;
  const endMinutes = end.hours * 60 + end.minutes;

  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
}

export function isWithinQuietHours(
  date: Date,
  quietHoursStart: string | null,
  quietHoursEnd: string | null
): boolean {
  if (!quietHoursStart || !quietHoursEnd) {
    return false;
  }

  const start = parseTimeString(quietHoursStart);
  const end = parseTimeString(quietHoursEnd);
  const hours = date.getHours();
  const minutes = date.getMinutes();

  const currentMinutes = hours * 60 + minutes;
  const startMinutes = start.hours * 60 + start.minutes;
  const endMinutes = end.hours * 60 + end.minutes;

  // Handle overnight quiet hours (e.g., 22:00 to 07:00)
  if (startMinutes > endMinutes) {
    return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
  }

  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
}

export function getStartOfDay(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

export function getEndOfDay(date: Date): Date {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end;
}

export function getStartOfWeek(date: Date): Date {
  const start = new Date(date);
  const day = start.getDay();
  const diff = start.getDate() - day + (day === 0 ? -6 : 1); // Monday as first day
  start.setDate(diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

export function getEndOfWeek(date: Date): Date {
  const start = getStartOfWeek(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60000);
}

// ==================== STRING HELPERS ====================

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

export function truncate(text: string, maxLength: number, suffix: string = '...'): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength - suffix.length) + suffix;
}

export function capitalizeFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

export function formatName(firstName?: string | null, lastName?: string | null): string {
  const parts = [firstName, lastName].filter(Boolean);
  return parts.join(' ') || 'Unknown';
}

// ==================== OBJECT HELPERS ====================

export function omit<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> {
  const result = { ...obj };
  for (const key of keys) {
    delete result[key];
  }
  return result;
}

export function pick<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[]
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key];
    }
  }
  return result;
}

export function removeNullish<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== null && value !== undefined) {
      result[key as keyof T] = value as T[keyof T];
    }
  }
  return result;
}

// ==================== ASYNC HELPERS ====================

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxAttempts) {
        await sleep(delay * attempt); // Exponential backoff
      }
    }
  }

  throw lastError;
}

// ==================== CALCULATION HELPERS ====================

export function calculatePercentage(value: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((value / total) * 100);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// ==================== ID HELPERS ====================

export function isValidUUID(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

// ==================== EMAIL HELPERS ====================

export function extractEmailDomain(email: string): string {
  return email.split('@')[1] || '';
}

export function isBusinessEmail(email: string): boolean {
  const freeProviders = [
    'gmail.com',
    'yahoo.com',
    'hotmail.com',
    'outlook.com',
    'aol.com',
    'icloud.com',
    'mail.com',
    'protonmail.com',
  ];
  const domain = extractEmailDomain(email).toLowerCase();
  return !freeProviders.includes(domain);
}
