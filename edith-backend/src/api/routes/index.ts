import { Router } from 'express';
import type { Router as RouterType } from 'express';
import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import healthRoutes from './health.routes.js';
import agentRoutes from './agent.routes.js';
import approvalRoutes from './approval.routes.js';
import oauthRoutes from './oauth.routes.js';
import webhookRoutes from './webhook.routes.js';

const router: RouterType = Router();

// Health routes (no /api prefix)
router.use('/health', healthRoutes);
router.use('/info', healthRoutes);

// API routes
router.use('/api/auth', authRoutes);
router.use('/api/user', userRoutes);

// Agent and AI routes
router.use('/api/chat', agentRoutes);
router.use('/api/agents', agentRoutes);
router.use('/api/approvals', approvalRoutes);

// Placeholder routes - to be implemented
router.use('/api/inbox', (_req, res) => {
  res.json({ message: 'Inbox routes - coming soon' });
});

router.use('/api/calendar', (_req, res) => {
  res.json({ message: 'Calendar routes - coming soon' });
});

router.use('/api/crm', (_req, res) => {
  res.json({ message: 'CRM routes - coming soon' });
});

router.use('/api/travel', (_req, res) => {
  res.json({ message: 'Travel routes - coming soon' });
});

router.use('/api/tasks', (_req, res) => {
  res.json({ message: 'Tasks routes - coming soon' });
});

router.use('/api/dashboard', (_req, res) => {
  res.json({ message: 'Dashboard routes - coming soon' });
});

// OAuth and Integration routes
router.use('/api/oauth', oauthRoutes);
router.use('/api/integrations', oauthRoutes); // Alias for convenience

// Webhook routes (no /api prefix - direct paths for external services)
router.use('/webhooks', webhookRoutes);
router.use('/api/webhooks', webhookRoutes); // Also support /api prefix

export default router;
