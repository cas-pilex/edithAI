import { z } from 'zod';

export const profileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  timezone: z.string().optional(),
  locale: z.string().optional(),
});
export type ProfileFormData = z.infer<typeof profileSchema>;

export const preferencesSchema = z.object({
  communicationTone: z.enum(['FORMAL', 'CASUAL', 'MIXED']).optional(),
  workingHoursStart: z.string().optional(),
  workingHoursEnd: z.string().optional(),
  allowAnalytics: z.boolean().optional(),
});
export type PreferencesFormData = z.infer<typeof preferencesSchema>;
