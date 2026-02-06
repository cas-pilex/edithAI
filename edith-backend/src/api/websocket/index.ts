/**
 * WebSocket Implementation
 * Real-time updates using Socket.IO
 */

import type { Server as SocketIOServer, Socket } from 'socket.io';
import { authService } from '../../services/AuthService.js';
import { logger } from '../../utils/logger.js';

// Map of userId to socket IDs for routing events to specific users
const userSockets: Map<string, Set<string>> = new Map();

// Event types emitted from server to client
export type ServerToClientEvents = {
  // Inbox events
  'inbox:new': (data: { email: InboxEventData }) => void;
  'inbox:updated': (data: { emailId: string; changes: Record<string, unknown> }) => void;
  'inbox:synced': (data: { count: number; timestamp: string }) => void;

  // Calendar events
  'calendar:new': (data: { event: CalendarEventData }) => void;
  'calendar:updated': (data: { eventId: string; changes: Record<string, unknown> }) => void;
  'calendar:deleted': (data: { eventId: string }) => void;
  'calendar:reminder': (data: { event: CalendarEventData; minutesBefore: number }) => void;

  // Task events
  'task:new': (data: { task: TaskEventData }) => void;
  'task:updated': (data: { taskId: string; changes: Record<string, unknown> }) => void;
  'task:deleted': (data: { taskId: string }) => void;
  'task:completed': (data: { taskId: string; completedAt: string }) => void;

  // Notification events
  'notification:new': (data: NotificationEventData) => void;
  'notification:read': (data: { notificationId: string }) => void;

  // Approval events
  'approval:new': (data: ApprovalEventData) => void;
  'approval:resolved': (data: { approvalId: string; status: 'approved' | 'rejected' }) => void;

  // Connection events
  'connected': (data: { userId: string; timestamp: string }) => void;
  'error': (data: { code: string; message: string }) => void;
};

// Event types received from client
export type ClientToServerEvents = {
  'authenticate': (token: string, callback: (success: boolean) => void) => void;
  'subscribe': (channels: string[]) => void;
  'unsubscribe': (channels: string[]) => void;
  'ping': (callback: (timestamp: string) => void) => void;
};

// Event data types
interface InboxEventData {
  id: string;
  subject: string;
  fromAddress: string;
  fromName?: string;
  snippet?: string;
  receivedAt: string;
  category?: string;
  priorityScore?: number;
}

interface CalendarEventData {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  location?: string;
  isOnline: boolean;
  meetingUrl?: string;
}

interface TaskEventData {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate?: string;
}

interface NotificationEventData {
  id: string;
  type: string;
  title: string;
  body: string;
  priority: string;
  createdAt: string;
  data?: Record<string, unknown>;
}

interface ApprovalEventData {
  id: string;
  agentType: string;
  action: string;
  description: string;
  confidence: number;
  expiresAt: string;
}

/**
 * Initialize WebSocket handlers
 */
export function initializeWebSocket(io: SocketIOServer): void {
  io.on('connection', (socket: Socket) => {
    logger.debug('Socket connected', { socketId: socket.id });

    // Handle authentication
    socket.on('authenticate', async (token: string, callback: (success: boolean) => void) => {
      try {
        const payload = authService.verifyAccessToken(token);
        const userId = payload.userId;

        // Store user's socket
        if (!userSockets.has(userId)) {
          userSockets.set(userId, new Set());
        }
        userSockets.get(userId)!.add(socket.id);

        // Join user-specific room
        socket.join(`user:${userId}`);

        // Store userId on socket for later use
        (socket as Socket & { userId?: string }).userId = userId;

        logger.info('Socket authenticated', { socketId: socket.id, userId });

        // Emit connected event
        socket.emit('connected', {
          userId,
          timestamp: new Date().toISOString(),
        });

        callback(true);
      } catch (error) {
        logger.warn('Socket authentication failed', {
          socketId: socket.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        socket.emit('error', {
          code: 'AUTH_FAILED',
          message: 'Authentication failed',
        });

        callback(false);
      }
    });

    // Handle channel subscription
    socket.on('subscribe', (channels: string[]) => {
      const userId = (socket as Socket & { userId?: string }).userId;
      if (!userId) {
        socket.emit('error', {
          code: 'NOT_AUTHENTICATED',
          message: 'Please authenticate first',
        });
        return;
      }

      for (const channel of channels) {
        // Only allow subscribing to user's own channels
        if (channel.startsWith(`user:${userId}:`) || channel === `user:${userId}`) {
          socket.join(channel);
          logger.debug('Socket subscribed to channel', { socketId: socket.id, channel });
        }
      }
    });

    // Handle channel unsubscription
    socket.on('unsubscribe', (channels: string[]) => {
      for (const channel of channels) {
        socket.leave(channel);
        logger.debug('Socket unsubscribed from channel', { socketId: socket.id, channel });
      }
    });

    // Handle ping for connection keep-alive
    socket.on('ping', (callback: (timestamp: string) => void) => {
      callback(new Date().toISOString());
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      const userId = (socket as Socket & { userId?: string }).userId;

      if (userId) {
        // Remove socket from user's socket set
        const sockets = userSockets.get(userId);
        if (sockets) {
          sockets.delete(socket.id);
          if (sockets.size === 0) {
            userSockets.delete(userId);
          }
        }
      }

      logger.debug('Socket disconnected', { socketId: socket.id, userId });
    });
  });

  logger.info('WebSocket handlers initialized');
}

/**
 * Emit event to a specific user
 */
export function emitToUser<E extends keyof ServerToClientEvents>(
  io: SocketIOServer,
  userId: string,
  event: E,
  data: Parameters<ServerToClientEvents[E]>[0]
): void {
  io.to(`user:${userId}`).emit(event, data);
  logger.debug('Emitted event to user', { userId, event });
}

/**
 * Emit event to multiple users
 */
export function emitToUsers<E extends keyof ServerToClientEvents>(
  io: SocketIOServer,
  userIds: string[],
  event: E,
  data: Parameters<ServerToClientEvents[E]>[0]
): void {
  for (const userId of userIds) {
    io.to(`user:${userId}`).emit(event, data);
  }
  logger.debug('Emitted event to users', { userIds, event });
}

/**
 * Check if a user is currently connected
 */
export function isUserConnected(userId: string): boolean {
  return userSockets.has(userId) && userSockets.get(userId)!.size > 0;
}

/**
 * Get count of connected sockets for a user
 */
export function getUserConnectionCount(userId: string): number {
  return userSockets.get(userId)?.size || 0;
}

/**
 * Helper to create inbox event data
 */
export function createInboxEventData(email: {
  id: string;
  subject: string;
  fromAddress: string;
  fromName?: string | null;
  snippet?: string | null;
  receivedAt: Date;
  category?: string | null;
  priorityScore?: number | null;
}): InboxEventData {
  return {
    id: email.id,
    subject: email.subject,
    fromAddress: email.fromAddress,
    fromName: email.fromName || undefined,
    snippet: email.snippet || undefined,
    receivedAt: email.receivedAt.toISOString(),
    category: email.category || undefined,
    priorityScore: email.priorityScore || undefined,
  };
}

/**
 * Helper to create calendar event data
 */
export function createCalendarEventData(event: {
  id: string;
  title: string;
  startTime: Date;
  endTime: Date;
  location?: string | null;
  isOnline: boolean;
  meetingUrl?: string | null;
}): CalendarEventData {
  return {
    id: event.id,
    title: event.title,
    startTime: event.startTime.toISOString(),
    endTime: event.endTime.toISOString(),
    location: event.location || undefined,
    isOnline: event.isOnline,
    meetingUrl: event.meetingUrl || undefined,
  };
}

/**
 * Helper to create task event data
 */
export function createTaskEventData(task: {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate?: Date | null;
}): TaskEventData {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate?.toISOString(),
  };
}

/**
 * Helper to create notification event data
 */
export function createNotificationEventData(notification: {
  id: string;
  type: string;
  title: string;
  body: string;
  priority: string;
  createdAt: Date;
  data?: Record<string, unknown>;
}): NotificationEventData {
  return {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    priority: notification.priority,
    createdAt: notification.createdAt.toISOString(),
    data: notification.data,
  };
}

/**
 * Helper to create approval event data
 */
export function createApprovalEventData(approval: {
  id: string;
  agentType: string;
  action: string;
  description?: string | null;
  confidence: number;
  expiresAt?: Date | null;
}): ApprovalEventData {
  return {
    id: approval.id,
    agentType: approval.agentType,
    action: approval.action,
    description: approval.description || '',
    confidence: approval.confidence,
    expiresAt: approval.expiresAt?.toISOString() || '',
  };
}
