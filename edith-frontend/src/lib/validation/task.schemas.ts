import { z } from 'zod';

export const createTaskSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  priority: z.enum(['URGENT', 'HIGH', 'MEDIUM', 'LOW']).optional(),
  dueDate: z.string().optional(),
  tags: z.array(z.string()).optional(),
});
export type CreateTaskFormData = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = createTaskSchema.partial();
export type UpdateTaskFormData = z.infer<typeof updateTaskSchema>;
