import { prisma } from '../database/client.js';
import { auditService } from './AuditService.js';
import { logger } from '../utils/logger.js';
import type {
  SafeUser,
  UserWithPreferences,
  UpdateUserInput,
  UpdatePreferencesInput,
  AuditContext,
} from '../types/index.js';

class UserService {
  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<SafeUser | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) return null;

    const { passwordHash: _, ...safeUser } = user;
    return safeUser;
  }

  /**
   * Get user with preferences
   */
  async getUserWithPreferences(userId: string): Promise<UserWithPreferences | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { preferences: true },
    });

    if (!user) return null;

    const { passwordHash: _, ...safeUser } = user;
    return safeUser;
  }

  /**
   * Update user profile
   */
  async updateProfile(
    userId: string,
    data: UpdateUserInput,
    context: AuditContext
  ): Promise<SafeUser> {
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        name: data.name,
        timezone: data.timezone,
        locale: data.locale,
      },
    });

    await auditService.logUpdate('User', userId, context, data as unknown as Record<string, unknown>);

    const { passwordHash: _, ...safeUser } = user;
    return safeUser;
  }

  /**
   * Get user preferences
   */
  async getPreferences(userId: string) {
    return prisma.userPreferences.findUnique({
      where: { userId },
    });
  }

  /**
   * Update user preferences
   */
  async updatePreferences(
    userId: string,
    data: UpdatePreferencesInput,
    context: AuditContext
  ) {
    const preferences = await prisma.userPreferences.upsert({
      where: { userId },
      update: data,
      create: {
        userId,
        ...data,
      },
    });

    await auditService.logUpdate('UserPreferences', userId, context, data as unknown as Record<string, unknown>);

    return preferences;
  }

  /**
   * Delete user account (GDPR - Right to be Forgotten)
   */
  async deleteAccount(userId: string, context: AuditContext): Promise<void> {
    // Create deletion request
    await prisma.dataDeletionRequest.create({
      data: {
        userId,
        scheduledFor: new Date(), // Immediate deletion
      },
    });

    // Log the deletion request
    await auditService.log(
      {
        action: 'ACCOUNT_DELETION_REQUESTED',
        resource: 'User',
        resourceId: userId,
      },
      context
    );

    // Perform deletion
    await this.performAccountDeletion(userId);

    logger.info('User account deleted', { userId });
  }

  /**
   * Perform actual account deletion
   */
  private async performAccountDeletion(userId: string): Promise<void> {
    // Delete in order to respect foreign keys
    // Most are handled by CASCADE, but let's be explicit

    await prisma.$transaction(async (tx) => {
      // Delete all user data
      await tx.notification.deleteMany({ where: { userId } });
      await tx.actionLog.deleteMany({ where: { userId } });
      await tx.userPattern.deleteMany({ where: { userId } });
      await tx.recurringTask.deleteMany({ where: { userId } });
      await tx.task.deleteMany({ where: { userId } });
      await tx.expenseReport.deleteMany({ where: { userId } });
      await tx.expense.deleteMany({ where: { userId } });
      await tx.travelSearch.deleteMany({ where: { userId } });

      // Delete trips (which cascades to bookings)
      await tx.trip.deleteMany({ where: { userId } });

      // Delete contacts (which cascades to interactions and reminders)
      await tx.contact.deleteMany({ where: { userId } });

      // Delete calendar data
      await tx.calendarSync.deleteMany({ where: { userId } });
      await tx.schedulingPreference.deleteMany({ where: { userId } });
      await tx.calendarEvent.deleteMany({ where: { userId } });

      // Delete email data
      await tx.emailRule.deleteMany({ where: { userId } });
      await tx.emailDraft.deleteMany({ where: { userId } });
      await tx.email.deleteMany({ where: { userId } });

      // Delete integrations
      await tx.userIntegration.deleteMany({ where: { userId } });

      // Delete sessions
      await tx.session.deleteMany({ where: { userId } });

      // Delete preferences
      await tx.userPreferences.deleteMany({ where: { userId } });

      // Delete metrics
      await tx.successMetrics.deleteMany({ where: { userId } });
      await tx.weeklyReport.deleteMany({ where: { userId } });

      // Update deletion request
      await tx.dataDeletionRequest.updateMany({
        where: { userId, status: 'PENDING' },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });

      // Finally delete the user
      await tx.user.delete({ where: { id: userId } });
    });
  }

  /**
   * Export all user data (GDPR - Right to Data Portability)
   */
  async exportUserData(userId: string, context: AuditContext): Promise<Record<string, unknown>> {
    // Create export request
    const exportRequest = await prisma.dataExportRequest.create({
      data: { userId },
    });

    // Log the export
    await auditService.log(
      {
        action: 'DATA_EXPORT_REQUESTED',
        resource: 'User',
        resourceId: userId,
      },
      context
    );

    // Gather all user data
    const [
      user,
      preferences,
      emails,
      calendarEvents,
      contacts,
      tasks,
      trips,
      expenses,
      integrations,
      patterns,
      actionLogs,
      notifications,
      auditLogs,
    ] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.userPreferences.findUnique({ where: { userId } }),
      prisma.email.findMany({ where: { userId } }),
      prisma.calendarEvent.findMany({ where: { userId }, include: { meetingPrep: true } }),
      prisma.contact.findMany({ where: { userId }, include: { interactions: true, reminders: true } }),
      prisma.task.findMany({ where: { userId } }),
      prisma.trip.findMany({ where: { userId }, include: { bookings: true } }),
      prisma.expense.findMany({ where: { userId } }),
      prisma.userIntegration.findMany({
        where: { userId },
        select: {
          provider: true,
          isActive: true,
          connectedAt: true,
          lastSyncAt: true,
          // Exclude encrypted tokens
        },
      }),
      prisma.userPattern.findMany({ where: { userId } }),
      prisma.actionLog.findMany({ where: { userId } }),
      prisma.notification.findMany({ where: { userId } }),
      auditService.getUserAuditLogs(userId),
    ]);

    // Mark export as complete
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // Expires in 7 days

    await prisma.dataExportRequest.update({
      where: { id: exportRequest.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        expiresAt,
      },
    });

    // Remove sensitive fields from user
    if (user) {
      const { passwordHash: _, ...safeUser } = user;
      return {
        exportedAt: new Date().toISOString(),
        user: safeUser,
        preferences,
        emails: emails.length,
        emailData: emails.map((e) => ({
          ...e,
          bodyHtml: undefined, // Exclude large HTML
        })),
        calendarEvents,
        contacts,
        tasks,
        trips,
        expenses,
        integrations,
        patterns,
        actionLogs,
        notifications,
        auditLogs,
      };
    }

    return { error: 'User not found' };
  }

  /**
   * Deactivate user account
   */
  async deactivateAccount(userId: string, context: AuditContext): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
    });

    // Delete all sessions
    await prisma.session.deleteMany({ where: { userId } });

    await auditService.logUpdate('User', userId, context, { isActive: false });
    logger.info('User account deactivated', { userId });
  }

  /**
   * Reactivate user account
   */
  async reactivateAccount(userId: string, context: AuditContext): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { isActive: true },
    });

    await auditService.logUpdate('User', userId, context, { isActive: true });
    logger.info('User account reactivated', { userId });
  }
}

export const userService = new UserService();
export default userService;
