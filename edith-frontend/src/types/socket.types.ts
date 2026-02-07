import type { Task, Email, CalendarEvent, Approval, Notification } from '@/types';

export interface ServerToClientEvents {
  'task:new': (task: Task) => void;
  'task:updated': (task: Task) => void;
  'task:deleted': (id: string) => void;
  'email:new': (email: Email) => void;
  'email:updated': (email: Email) => void;
  'calendar:event:new': (event: CalendarEvent) => void;
  'calendar:event:updated': (event: CalendarEvent) => void;
  'calendar:event:deleted': (id: string) => void;
  'approval:new': (approval: Approval) => void;
  'approval:updated': (approval: Approval) => void;
  'notification': (notification: Notification) => void;
  'agent:status': (data: { agent: string; status: string }) => void;
}

export interface ClientToServerEvents {
  'subscribe': (channel: string) => void;
  'unsubscribe': (channel: string) => void;
}
