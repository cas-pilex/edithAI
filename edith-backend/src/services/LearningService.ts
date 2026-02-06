/**
 * LearningService
 * Handles pattern detection, preference inference, and feedback processing for agents
 */

import { prisma } from '../database/client.js';
import { logger } from '../utils/logger.js';
import type {
  AgentDomain,
  ApprovalDecision,
  UserPatternData,
} from '../types/agent.types.js';

// Match Prisma PatternType enum: COMMUNICATION_STYLE, SCHEDULING, RESPONSE_TIME, PRIORITY, OTHER
export type PatternType =
  | 'COMMUNICATION_STYLE'
  | 'SCHEDULING'
  | 'RESPONSE_TIME'
  | 'PRIORITY'
  | 'OTHER';

export interface DetectedPattern {
  type: PatternType;
  domain: AgentDomain | null;
  pattern: Record<string, unknown>;
  confidence: number;
  occurrences: number;
  examples: unknown[];
}

export interface CommunicationStyle {
  formality: 'formal' | 'casual' | 'mixed';
  verbosity: 'concise' | 'detailed' | 'mixed';
  emoji: boolean;
  signOff: string | null;
  greeting: string | null;
}

export interface SchedulingPreferences {
  preferredMeetingDuration: number;
  preferredMeetingTimes: string[];
  bufferBetweenMeetings: number;
  avoidDays: string[];
  maxMeetingsPerDay: number;
  focusTimeBlocks: Array<{ start: string; end: string }>;
}

class LearningServiceImpl {
  private readonly MIN_OCCURRENCES_FOR_PATTERN = 3;
  private readonly MIN_CONFIDENCE_THRESHOLD = 0.6;

  // ============================================================================
  // Pattern Detection
  // ============================================================================

  /**
   * Detect patterns from user actions
   */
  async detectPatterns(userId: string): Promise<DetectedPattern[]> {
    const patterns: DetectedPattern[] = [];

    // Get recent action logs
    const recentActions = await prisma.actionLog.findMany({
      where: {
        userId,
        status: 'SUCCESS',
        executedAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
        },
      },
      orderBy: { executedAt: 'desc' },
      take: 500,
    });

    // Detect email handling patterns
    const emailPatterns = this.detectEmailPatterns(recentActions);
    patterns.push(...emailPatterns);

    // Detect scheduling patterns
    const schedulePatterns = this.detectSchedulingPatterns(recentActions);
    patterns.push(...schedulePatterns);

    // Detect time-based patterns
    const timePatterns = this.detectTimePatterns(recentActions);
    patterns.push(...timePatterns);

    // Filter by minimum confidence
    return patterns.filter(p => p.confidence >= this.MIN_CONFIDENCE_THRESHOLD);
  }

  /**
   * Detect email handling patterns
   */
  private detectEmailPatterns(actions: Array<{ action: string; input: unknown; output: unknown }>): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];

    // Find email-related actions
    const emailActions = actions.filter(a =>
      ['categorize_email', 'draft_reply', 'archive_emails', 'send_email'].includes(a.action)
    );

    if (emailActions.length < this.MIN_OCCURRENCES_FOR_PATTERN) {
      return patterns;
    }

    // Analyze categorization patterns
    const categorizations = emailActions.filter(a => a.action === 'categorize_email');
    if (categorizations.length >= this.MIN_OCCURRENCES_FOR_PATTERN) {
      const categories: Record<string, number> = {};
      for (const cat of categorizations) {
        const output = cat.output as Record<string, unknown>;
        const category = output?.category as string;
        if (category) {
          categories[category] = (categories[category] || 0) + 1;
        }
      }

      const topCategory = Object.entries(categories)
        .sort((a, b) => b[1] - a[1])[0];

      if (topCategory && topCategory[1] >= this.MIN_OCCURRENCES_FOR_PATTERN) {
        patterns.push({
          type: 'PRIORITY', // Email categorization relates to priority handling
          domain: 'inbox',
          pattern: {
            preferredCategory: topCategory[0],
            distribution: categories,
          },
          confidence: topCategory[1] / categorizations.length,
          occurrences: categorizations.length,
          examples: categorizations.slice(0, 3).map(c => c.input),
        });
      }
    }

    return patterns;
  }

  /**
   * Detect scheduling patterns
   */
  private detectSchedulingPatterns(actions: Array<{ action: string; input: unknown; executedAt: Date }>): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];

    const scheduleActions = actions.filter(a =>
      ['schedule_meeting', 'block_focus_time', 'add_buffer_time'].includes(a.action)
    );

    if (scheduleActions.length < this.MIN_OCCURRENCES_FOR_PATTERN) {
      return patterns;
    }

    // Analyze meeting duration preferences
    const meetings = scheduleActions.filter(a => a.action === 'schedule_meeting');
    if (meetings.length >= this.MIN_OCCURRENCES_FOR_PATTERN) {
      const durations: number[] = [];
      for (const meeting of meetings) {
        const input = meeting.input as Record<string, unknown>;
        const duration = input?.duration as number;
        if (duration) {
          durations.push(duration);
        }
      }

      if (durations.length >= this.MIN_OCCURRENCES_FOR_PATTERN) {
        const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
        const modeMap: Record<number, number> = {};
        for (const d of durations) {
          modeMap[d] = (modeMap[d] || 0) + 1;
        }
        const preferredDuration = parseInt(
          Object.entries(modeMap).sort((a, b) => b[1] - a[1])[0][0]
        );

        patterns.push({
          type: 'SCHEDULING',
          domain: 'calendar',
          pattern: {
            preferredMeetingDuration: preferredDuration,
            averageDuration: avgDuration,
            durationDistribution: modeMap,
          },
          confidence: (modeMap[preferredDuration] || 0) / durations.length,
          occurrences: meetings.length,
          examples: meetings.slice(0, 3).map(m => m.input),
        });
      }
    }

    return patterns;
  }

  /**
   * Detect time-based patterns
   */
  private detectTimePatterns(actions: Array<{ action: string; executedAt: Date }>): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];

    if (actions.length < this.MIN_OCCURRENCES_FOR_PATTERN) {
      return patterns;
    }

    // Analyze what times user is most active
    const hourCounts: Record<number, number> = {};
    const dayCounts: Record<number, number> = {};

    for (const action of actions) {
      const hour = action.executedAt.getHours();
      const day = action.executedAt.getDay();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
      dayCounts[day] = (dayCounts[day] || 0) + 1;
    }

    // Find peak hours
    const sortedHours = Object.entries(hourCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    if (sortedHours.length >= 3) {
      patterns.push({
        type: 'RESPONSE_TIME',
        domain: null,
        pattern: {
          peakHours: sortedHours.map(h => parseInt(h[0])),
          hourDistribution: hourCounts,
          dayDistribution: dayCounts,
        },
        confidence: 0.8,
        occurrences: actions.length,
        examples: [],
      });
    }

    return patterns;
  }

  // ============================================================================
  // Corrections & Feedback
  // ============================================================================

  /**
   * Record a user correction
   */
  async recordCorrection(
    userId: string,
    actionId: string,
    original: unknown,
    corrected: unknown
  ): Promise<void> {
    // Get the original action
    const actionLog = await prisma.actionLog.findUnique({
      where: { id: actionId },
    });

    if (!actionLog) {
      logger.warn('Action not found for correction', { actionId });
      return;
    }

    // Update the action log with feedback
    await prisma.actionLog.update({
      where: { id: actionId },
      data: {
        feedback: {
          type: 'correction',
          original,
          corrected,
          timestamp: new Date().toISOString(),
        } as unknown as Record<string, unknown>,
      },
    });

    // Store as a pattern for future learning
    await prisma.userPattern.create({
      data: {
        userId,
        patternType: 'OTHER',
        patternData: {
          action: actionLog.action,
          original,
          corrected,
          context: actionLog.input,
          learnedFrom: 'correction',
        } as object,
        confidence: 0.9, // High confidence for explicit corrections
        occurrences: 1,
        lastObserved: new Date(),
      },
    });

    logger.info('Correction recorded', {
      userId,
      actionId,
      action: actionLog.action,
    });
  }

  // ============================================================================
  // Preference Inference
  // ============================================================================

  /**
   * Infer communication style from user actions
   */
  async inferCommunicationStyle(userId: string): Promise<CommunicationStyle> {
    // Get email drafts and sent emails
    const emailActions = await prisma.actionLog.findMany({
      where: {
        userId,
        action: { in: ['draft_reply', 'send_email'] },
        status: 'SUCCESS',
      },
      orderBy: { executedAt: 'desc' },
      take: 50,
    });

    let formalCount = 0;
    let casualCount = 0;
    let emojiCount = 0;
    let conciseCount = 0;
    let detailedCount = 0;
    const signOffs: Record<string, number> = {};
    const greetings: Record<string, number> = {};

    for (const action of emailActions) {
      const input = action.input as Record<string, unknown>;
      const content = (input?.content as string) || (input?.body as string) || '';

      // Check formality
      if (content.match(/dear|sincerely|regards|respectfully/i)) {
        formalCount++;
      } else if (content.match(/hey|hi there|thanks!|cheers/i)) {
        casualCount++;
      }

      // Check emoji usage
      if (content.match(/[\u{1F300}-\u{1F9FF}]/u)) {
        emojiCount++;
      }

      // Check verbosity
      if (content.length < 200) {
        conciseCount++;
      } else if (content.length > 500) {
        detailedCount++;
      }

      // Extract sign-offs
      const signOffMatch = content.match(/(best|regards|thanks|cheers|sincerely)[,\s]*$/i);
      if (signOffMatch) {
        const signOff = signOffMatch[1].toLowerCase();
        signOffs[signOff] = (signOffs[signOff] || 0) + 1;
      }

      // Extract greetings
      const greetingMatch = content.match(/^(hi|hello|hey|dear)[,\s]*/i);
      if (greetingMatch) {
        const greeting = greetingMatch[1].toLowerCase();
        greetings[greeting] = (greetings[greeting] || 0) + 1;
      }
    }

    const total = emailActions.length || 1;
    const topSignOff = Object.entries(signOffs).sort((a, b) => b[1] - a[1])[0];
    const topGreeting = Object.entries(greetings).sort((a, b) => b[1] - a[1])[0];

    return {
      formality: formalCount > casualCount ? 'formal' :
        casualCount > formalCount ? 'casual' : 'mixed',
      verbosity: conciseCount > detailedCount ? 'concise' :
        detailedCount > conciseCount ? 'detailed' : 'mixed',
      emoji: emojiCount / total > 0.1,
      signOff: topSignOff ? topSignOff[0] : null,
      greeting: topGreeting ? topGreeting[0] : null,
    };
  }

  /**
   * Infer scheduling preferences
   */
  async inferSchedulingPreferences(userId: string): Promise<SchedulingPreferences> {
    const scheduleActions = await prisma.actionLog.findMany({
      where: {
        userId,
        action: { in: ['schedule_meeting', 'block_focus_time'] },
        status: 'SUCCESS',
      },
      orderBy: { executedAt: 'desc' },
      take: 100,
    });

    const durations: number[] = [];
    const times: string[] = [];
    const buffers: number[] = [];
    const focusBlocks: Array<{ start: string; end: string }> = [];

    for (const action of scheduleActions) {
      const input = action.input as Record<string, unknown>;

      if (action.action === 'schedule_meeting') {
        if (input.duration) durations.push(input.duration as number);
        if (input.startTime) times.push(new Date(input.startTime as string).toTimeString().slice(0, 5));
        if (input.bufferBefore || input.bufferAfter) {
          buffers.push((input.bufferBefore as number || 0) + (input.bufferAfter as number || 0));
        }
      }

      if (action.action === 'block_focus_time') {
        if (input.startTime && input.endTime) {
          focusBlocks.push({
            start: new Date(input.startTime as string).toTimeString().slice(0, 5),
            end: new Date(input.endTime as string).toTimeString().slice(0, 5),
          });
        }
      }
    }

    // Calculate preferred duration (mode)
    const durationMode: Record<number, number> = {};
    for (const d of durations) {
      durationMode[d] = (durationMode[d] || 0) + 1;
    }
    const preferredDuration = parseInt(
      Object.entries(durationMode).sort((a, b) => b[1] - a[1])[0]?.[0] || '30'
    );

    // Calculate preferred times
    const timeCounts: Record<string, number> = {};
    for (const t of times) {
      timeCounts[t] = (timeCounts[t] || 0) + 1;
    }
    const preferredTimes = Object.entries(timeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(t => t[0]);

    // Calculate average buffer
    const avgBuffer = buffers.length > 0
      ? Math.round(buffers.reduce((a, b) => a + b, 0) / buffers.length)
      : 15;

    return {
      preferredMeetingDuration: preferredDuration,
      preferredMeetingTimes: preferredTimes,
      bufferBetweenMeetings: avgBuffer,
      avoidDays: [], // Would need more data to infer
      maxMeetingsPerDay: 8, // Default
      focusTimeBlocks: focusBlocks.slice(0, 3),
    };
  }

  // ============================================================================
  // Approval Feedback Processing
  // ============================================================================

  /**
   * Process approval/rejection feedback to adjust confidence thresholds
   */
  async processApprovalFeedback(
    userId: string,
    agentType: string,
    action: string,
    decision: ApprovalDecision
  ): Promise<void> {
    // Record the approval pattern
    // Find existing pattern first
    const existingPattern = await prisma.userPattern.findFirst({
      where: {
        userId,
        patternType: 'PRIORITY',
      },
    });

    if (existingPattern) {
      await prisma.userPattern.update({
        where: { id: existingPattern.id },
        data: {
          occurrences: { increment: 1 },
          lastObserved: new Date(),
        },
      });
    } else {
      await prisma.userPattern.create({
        data: {
          userId,
          patternType: 'PRIORITY',
          patternData: {
            type: 'approval_pattern',
            agentType,
            actions: {
              [action]: {
                approved: decision.approved ? 1 : 0,
                rejected: decision.approved ? 0 : 1,
                total: 1,
              },
            },
          } as object,
          confidence: 0.5,
          occurrences: 1,
          lastObserved: new Date(),
        },
      });
    }

    logger.debug('Approval feedback processed', {
      userId,
      agentType,
      action,
      approved: decision.approved,
    });
  }

  /**
   * Adjust confidence threshold based on approval history
   */
  async adjustConfidenceThreshold(
    userId: string,
    _domain: AgentDomain
  ): Promise<number> {
    // Get approval pattern for this domain
    const pattern = await prisma.userPattern.findFirst({
      where: {
        userId,
        patternType: 'PRIORITY',
      },
    });

    if (!pattern) {
      return 0.85; // Default threshold
    }

    const patternData = pattern.patternData as Record<string, unknown>;
    const actions = patternData.actions as Record<string, { approved: number; rejected: number; total: number }>;

    if (!actions) {
      return 0.85;
    }

    // Calculate overall approval rate
    let totalApproved = 0;
    let totalDecisions = 0;

    for (const actionStats of Object.values(actions)) {
      totalApproved += actionStats.approved;
      totalDecisions += actionStats.total;
    }

    if (totalDecisions === 0) {
      return 0.85;
    }

    const approvalRate = totalApproved / totalDecisions;

    // If user approves most things, lower the threshold (more auto-approve)
    // If user rejects often, raise the threshold (more confirmations)
    if (approvalRate > 0.9) {
      return 0.75;
    } else if (approvalRate > 0.7) {
      return 0.85;
    } else {
      return 0.95;
    }
  }

  // ============================================================================
  // Pattern CRUD
  // ============================================================================

  /**
   * Get patterns for a user
   */
  async getPatterns(
    userId: string,
    type?: PatternType
  ): Promise<UserPatternData[]> {
    const patterns = await prisma.userPattern.findMany({
      where: {
        userId,
        ...(type ? { patternType: type } : {}),
        isActive: true,
      },
      orderBy: { confidence: 'desc' },
    });

    return patterns.map(p => ({
      id: p.id,
      type: p.patternType as PatternType,
      data: p.patternData as Record<string, unknown>,
      confidence: p.confidence,
      occurrences: p.occurrences,
      lastSeen: p.lastObserved,
    }));
  }

  /**
   * Update a pattern
   */
  async updatePattern(
    patternId: string,
    userId: string,
    update: Partial<{
      patternData: Record<string, unknown>;
      confidence: number;
      isActive: boolean;
    }>
  ): Promise<void> {
    const updateData: Record<string, unknown> = {};
    if (update.patternData !== undefined) updateData.patternData = update.patternData as object;
    if (update.confidence !== undefined) updateData.confidence = update.confidence;
    if (update.isActive !== undefined) updateData.isActive = update.isActive;
    updateData.lastObserved = new Date();

    await prisma.userPattern.updateMany({
      where: {
        id: patternId,
        userId, // Ensure user owns this pattern
      },
      data: updateData,
    });
  }

  /**
   * Delete a pattern
   */
  async deletePattern(patternId: string, userId: string): Promise<void> {
    await prisma.userPattern.deleteMany({
      where: {
        id: patternId,
        userId,
      },
    });
  }

  /**
   * Merge similar patterns
   */
  async mergeSimilarPatterns(userId: string): Promise<number> {
    // Get all patterns for user
    const patterns = await prisma.userPattern.findMany({
      where: { userId, isActive: true },
    });

    // Group by patternType
    const groups = new Map<string, typeof patterns>();
    for (const pattern of patterns) {
      const key = `${pattern.patternType}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(pattern);
    }

    let mergedCount = 0;

    // Merge patterns within each group
    for (const [, groupPatterns] of groups) {
      if (groupPatterns.length <= 1) continue;

      // Keep the one with highest confidence, merge occurrences
      const sorted = groupPatterns.sort((a, b) => b.confidence - a.confidence);
      const keep = sorted[0];
      const toMerge = sorted.slice(1);

      let totalOccurrences = keep.occurrences;
      for (const pattern of toMerge) {
        totalOccurrences += pattern.occurrences;
      }

      // Update the kept pattern
      await prisma.userPattern.update({
        where: { id: keep.id },
        data: {
          occurrences: totalOccurrences,
          lastObserved: new Date(),
        },
      });

      // Delete merged patterns
      await prisma.userPattern.deleteMany({
        where: {
          id: { in: toMerge.map(p => p.id) },
        },
      });

      mergedCount += toMerge.length;
    }

    return mergedCount;
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  /**
   * Infer domain from agent type (reserved for future use)
   */
  private _inferDomainFromAgentType(agentType: string): AgentDomain | null {
    const mapping: Record<string, AgentDomain> = {
      InboxAgent: 'inbox',
      CalendarAgent: 'calendar',
      CRMAgent: 'crm',
      TravelAgent: 'travel',
      TaskAgent: 'tasks',
      MeetingPrepAgent: 'meeting_prep',
      OrchestratorAgent: 'orchestrator',
    };

    return mapping[agentType] || null;
  }
}

export const learningService = new LearningServiceImpl();
export default learningService;
