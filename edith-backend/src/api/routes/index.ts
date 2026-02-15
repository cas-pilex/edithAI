import { Router } from 'express';
import type { Router as RouterType } from 'express';

// Core routes
import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import healthRoutes from './health.routes.js';

// Agent routes
import agentRoutes from './agent.routes.js';
import approvalRoutes from './approval.routes.js';

// Domain routes
import tasksRoutes from './tasks.routes.js';
import inboxRoutes from './inbox.routes.js';
import calendarRoutes from './calendar.routes.js';
import crmRoutes from './crm.routes.js';
import expensesRoutes from './expenses.routes.js';
import travelRoutes from './travel.routes.js';
import dashboardRoutes from './dashboard.routes.js';

// Integration routes
import oauthRoutes from './oauth.routes.js';
import webhookRoutes from './webhook.routes.js';
import telegramRoutes from './telegram.routes.js';
import activityRoutes from './activity.routes.js';

const router: RouterType = Router();

// Health routes (no /api prefix)
router.use('/health', healthRoutes);
router.use('/info', healthRoutes);

// ==================== AUTHENTICATION ====================
router.use('/api/auth', authRoutes);

// ==================== USER ====================
router.use('/api/user', userRoutes);

// ==================== AGENT & AI ====================
router.use('/api/chat', agentRoutes);
router.use('/api/agents', agentRoutes);
router.use('/api/approvals', approvalRoutes);

// ==================== DOMAIN ROUTES ====================
// Tasks
router.use('/api/tasks', tasksRoutes);

// Inbox / Email
router.use('/api/inbox', inboxRoutes);

// Calendar
router.use('/api/calendar', calendarRoutes);

// CRM / Contacts
router.use('/api/crm', crmRoutes);

// Expenses
router.use('/api/expenses', expensesRoutes);

// Travel
router.use('/api/travel', travelRoutes);

// Dashboard & Reports
router.use('/api/dashboard', dashboardRoutes);
router.use('/api/reports', dashboardRoutes); // Reports are part of dashboard

// ==================== INTEGRATIONS ====================
// OAuth and Integration routes
router.use('/api/oauth', oauthRoutes);
router.use('/api/integrations', oauthRoutes); // Alias for convenience
router.use('/api/integrations/telegram', telegramRoutes);

// ==================== ACTIVITY LOG ====================
router.use('/api/activity', activityRoutes);

// Webhook routes (no /api prefix - direct paths for external services)
router.use('/webhooks', webhookRoutes);
router.use('/api/webhooks', webhookRoutes); // Also support /api prefix

export default router;
