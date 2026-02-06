/**
 * CRM API Routes
 * Contact and relationship management
 */

import { Router } from 'express';
import type { Router as RouterType, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { validateBody, validateUUID } from '../middleware/validation.middleware.js';
import { crmService } from '../../services/CRMService.js';
import { sendSuccess, sendPaginated, sendError } from '../../utils/helpers.js';
import { NotFoundError } from '../../utils/errors.js';
import {
  createContactSchema,
  updateContactSchema,
  addInteractionSchema,
  manageTagsSchema,
  setFollowUpSchema,
} from '../../utils/validation.js';
import type { AuthenticatedRequest } from '../../types/index.js';
import { logger } from '../../utils/logger.js';

const router: RouterType = Router();

// Apply authentication to all routes
router.use(authenticate);

/**
 * GET /crm/contacts
 * List contacts with filters and pagination
 */
router.get(
  '/contacts',
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const { page, limit, search, company, interests, minImportance, relationshipType } = req.query;

      const pageNum = Number(page) || 1;
      const limitNum = Math.min(Number(limit) || 20, 100);
      const offset = (pageNum - 1) * limitNum;

      const parsedFilters = {
        search: search as string | undefined,
        company: company as string | undefined,
        interests: interests ? String(interests).split(',') : undefined,
        minImportance: minImportance ? Number(minImportance) : undefined,
        relationshipType: relationshipType as string | undefined,
      };

      const { contacts, total } = await crmService.getContacts(
        userId,
        parsedFilters,
        { limit: limitNum, offset }
      );

      sendPaginated(res, contacts, pageNum, limitNum, total);
    } catch (error) {
      logger.error('Failed to get contacts', { error });
      sendError(res, 'Failed to retrieve contacts', 500);
    }
  }
);

/**
 * GET /crm/insights
 * Get relationship insights and network health
 */
router.get('/insights', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const insights = await crmService.getNetworkInsights(userId);
    sendSuccess(res, insights);
  } catch (error) {
    logger.error('Failed to get network insights', { error });
    sendError(res, 'Failed to retrieve network insights', 500);
  }
});

/**
 * GET /crm/follow-ups
 * Get overdue follow-ups
 */
router.get('/follow-ups', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const followUps = await crmService.getOverdueFollowUps(userId);
    sendSuccess(res, followUps);
  } catch (error) {
    logger.error('Failed to get follow-ups', { error });
    sendError(res, 'Failed to retrieve follow-ups', 500);
  }
});

/**
 * GET /crm/attention
 * Get contacts needing attention
 */
router.get('/attention', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const days = Number(req.query.days) || 30;
    const contacts = await crmService.getContactsNeedingAttention(userId, days);
    sendSuccess(res, contacts);
  } catch (error) {
    logger.error('Failed to get contacts needing attention', { error });
    sendError(res, 'Failed to retrieve contacts needing attention', 500);
  }
});

/**
 * GET /crm/contacts/:id
 * Get a single contact by ID
 */
router.get(
  '/contacts/:id',
  validateUUID('id'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const id = req.params.id as string;

      const contact = await crmService.getContactById(id, userId);

      if (!contact) {
        throw new NotFoundError('Contact');
      }

      sendSuccess(res, contact);
    } catch (error) {
      if (error instanceof NotFoundError) {
        sendError(res, error.message, error.statusCode);
        return;
      }
      logger.error('Failed to get contact', { error, contactId: req.params.id });
      sendError(res, 'Failed to retrieve contact', 500);
    }
  }
);

/**
 * POST /crm/contacts
 * Create a new contact
 */
router.post(
  '/contacts',
  validateBody(createContactSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const data = req.body;

      // Check for existing contact with same email
      if (data.email) {
        const existing = await crmService.getContactByEmail(data.email, userId);
        if (existing) {
          sendError(res, 'Contact with this email already exists', 409);
          return;
        }
      }

      const contact = await crmService.createContact(userId, data);
      sendSuccess(res, contact, 'Contact created successfully', 201);
    } catch (error) {
      logger.error('Failed to create contact', { error });
      sendError(res, 'Failed to create contact', 500);
    }
  }
);

/**
 * PATCH /crm/contacts/:id
 * Update a contact
 */
router.patch(
  '/contacts/:id',
  validateUUID('id'),
  validateBody(updateContactSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const id = req.params.id as string;
      const data = req.body;

      // Check if contact exists
      const existing = await crmService.getContactById(id, userId);
      if (!existing) {
        throw new NotFoundError('Contact');
      }

      await crmService.updateContact(id, userId, data);

      const updated = await crmService.getContactById(id, userId);
      sendSuccess(res, updated, 'Contact updated successfully');
    } catch (error) {
      if (error instanceof NotFoundError) {
        sendError(res, error.message, error.statusCode);
        return;
      }
      logger.error('Failed to update contact', { error, contactId: req.params.id });
      sendError(res, 'Failed to update contact', 500);
    }
  }
);

/**
 * DELETE /crm/contacts/:id
 * Delete a contact
 */
router.delete(
  '/contacts/:id',
  validateUUID('id'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const id = req.params.id as string;

      await crmService.deleteContact(id, userId);
      sendSuccess(res, { deleted: true }, 'Contact deleted successfully');
    } catch (error) {
      if (error instanceof Error && error.message === 'Contact not found') {
        sendError(res, 'Contact not found', 404);
        return;
      }
      logger.error('Failed to delete contact', { error, contactId: req.params.id });
      sendError(res, 'Failed to delete contact', 500);
    }
  }
);

/**
 * GET /crm/contacts/:id/interactions
 * Get interactions for a contact
 */
router.get(
  '/contacts/:id/interactions',
  validateUUID('id'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const id = req.params.id as string;

      const contact = await crmService.getContactById(id, userId);
      if (!contact) {
        throw new NotFoundError('Contact');
      }

      // Interactions are included in getContactById
      sendSuccess(res, contact.interactions || []);
    } catch (error) {
      if (error instanceof NotFoundError) {
        sendError(res, error.message, error.statusCode);
        return;
      }
      logger.error('Failed to get contact interactions', { error, contactId: req.params.id });
      sendError(res, 'Failed to retrieve interactions', 500);
    }
  }
);

/**
 * POST /crm/contacts/:id/interactions
 * Add an interaction to a contact
 */
router.post(
  '/contacts/:id/interactions',
  validateUUID('id'),
  validateBody(addInteractionSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const id = req.params.id as string;
      const data = req.body;

      const interaction = await crmService.logInteraction(userId, {
        contactId: id,
        type: data.type,
        summary: data.summary,
        sentiment: data.sentiment,
        date: data.date ? new Date(data.date) : undefined,
      });

      sendSuccess(res, interaction, 'Interaction logged successfully', 201);
    } catch (error) {
      if (error instanceof Error && error.message === 'Contact not found') {
        sendError(res, 'Contact not found', 404);
        return;
      }
      logger.error('Failed to log interaction', { error, contactId: req.params.id });
      sendError(res, 'Failed to log interaction', 500);
    }
  }
);

/**
 * POST /crm/contacts/:id/tags
 * Manage tags for a contact
 */
router.post(
  '/contacts/:id/tags',
  validateUUID('id'),
  validateBody(manageTagsSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const id = req.params.id as string;
      const { action, tags } = req.body;

      // Get existing contact
      const contact = await crmService.getContactById(id, userId);
      if (!contact) {
        throw new NotFoundError('Contact');
      }

      const existingTags = (contact.interests as string[]) || [];
      let newTags: string[];

      switch (action) {
        case 'add':
          newTags = [...new Set([...existingTags, ...tags])];
          break;
        case 'remove':
          newTags = existingTags.filter(t => !tags.includes(t));
          break;
        case 'set':
          newTags = tags;
          break;
        default:
          sendError(res, `Unknown action: ${action}`, 400);
          return;
      }

      await crmService.updateContact(id, userId, { interests: newTags });

      const updated = await crmService.getContactById(id, userId);
      sendSuccess(res, updated, 'Tags updated successfully');
    } catch (error) {
      if (error instanceof NotFoundError) {
        sendError(res, error.message, error.statusCode);
        return;
      }
      logger.error('Failed to manage tags', { error, contactId: req.params.id });
      sendError(res, 'Failed to manage tags', 500);
    }
  }
);

/**
 * POST /crm/contacts/:id/follow-up
 * Set a follow-up reminder for a contact
 */
router.post(
  '/contacts/:id/follow-up',
  validateUUID('id'),
  validateBody(setFollowUpSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const id = req.params.id as string;
      const { type, dueDate, message } = req.body;

      const reminder = await crmService.setFollowUp(userId, {
        contactId: id,
        type,
        dueDate: new Date(dueDate),
        message,
      });

      sendSuccess(res, reminder, 'Follow-up reminder set', 201);
    } catch (error) {
      if (error instanceof Error && error.message === 'Contact not found') {
        sendError(res, 'Contact not found', 404);
        return;
      }
      logger.error('Failed to set follow-up', { error, contactId: req.params.id });
      sendError(res, 'Failed to set follow-up reminder', 500);
    }
  }
);

/**
 * POST /crm/follow-ups/:id/complete
 * Complete a follow-up reminder
 */
router.post(
  '/follow-ups/:id/complete',
  validateUUID('id'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const id = req.params.id as string;

      const reminder = await crmService.completeFollowUp(id, userId);
      sendSuccess(res, reminder, 'Follow-up completed');
    } catch (error) {
      if (error instanceof Error && error.message === 'Reminder not found') {
        sendError(res, 'Reminder not found', 404);
        return;
      }
      logger.error('Failed to complete follow-up', { error, reminderId: req.params.id });
      sendError(res, 'Failed to complete follow-up', 500);
    }
  }
);

export default router;
