import type { PatternType } from '@prisma/client';
import type { AIAgentContext, AIAgentResult } from './index.js';

// ==================== AGENT DOMAINS ====================

export type AgentDomain =
  | 'inbox'
  | 'calendar'
  | 'crm'
  | 'travel'
  | 'tasks'
  | 'meeting_prep'
  | 'orchestrator';

// ==================== TOOL DEFINITIONS ====================

export interface AgentTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, ToolPropertySchema>;
    required?: string[];
  };
}

export interface ToolPropertySchema {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  enum?: string[];
  items?: ToolPropertySchema;
  properties?: Record<string, ToolPropertySchema>;
  required?: string[];
}

// ==================== TOOL EXECUTION ====================

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export type ToolHandler = (
  input: Record<string, unknown>,
  context: EnhancedAgentContext
) => Promise<ToolHandlerResult>;

export interface ToolHandlerResult {
  success: boolean;
  data?: unknown;
  error?: string;
  requiresApproval?: boolean;
  approvalDetails?: Partial<ApprovalDetails>;
}

export interface RegisteredTool {
  definition: AgentTool;
  handler: ToolHandler;
  domain: AgentDomain;
  requiresApproval: boolean;
  approvalCategory?: ApprovalCategory;
}

export interface ToolRegistry {
  tools: Map<string, RegisteredTool>;
  register(tool: RegisteredTool): void;
  get(name: string): RegisteredTool | undefined;
  getForDomain(domain: AgentDomain): AgentTool[];
  getHandlersForDomain(domain: AgentDomain): Map<string, RegisteredTool>;
}

// ==================== TOOL CONTEXT ====================

export interface ToolContext {
  userId: string;
  domain: AgentDomain;
  requestId: string;
  sessionId: string;
  userPreferences?: Record<string, unknown>;
}

// ==================== ENHANCED AGENT CONTEXT ====================

export interface RecentAction {
  id: string;
  agentType: string;
  action: string;
  summary: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  timestamp: Date;
  status: 'SUCCESS' | 'FAILURE' | 'PENDING_APPROVAL';
  confidence?: number;
}

export interface UserPatternData {
  id: string;
  type: PatternType;
  data: Record<string, unknown>;
  confidence: number;
  occurrences: number;
}

export interface EnhancedAgentContext extends AIAgentContext {
  sessionId: string;
  requestId: string;
  domain: AgentDomain;
  recentActions: RecentAction[];
  patterns: UserPatternData[];
  approvalCallback?: (decision: ApprovalDecision) => Promise<void>;
}

// ==================== ENHANCED AGENT RESULT ====================

export interface EnhancedAgentResult<T = unknown> extends AIAgentResult<T> {
  requiresApproval: boolean;
  approvalId?: string;
  approvalCategory?: ApprovalCategory;
  toolsUsed?: string[];
  tokensUsed?: number;
  chainOfThought?: string[];
  pendingApprovals?: ApprovalRequest[];
}

// ==================== APPROVAL WORKFLOW ====================

export type ApprovalCategory = 'AUTO_APPROVE' | 'REQUEST_APPROVAL' | 'ALWAYS_ASK';

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';

export interface ApprovalRequest {
  id: string;
  userId: string;
  agentType: string;
  action: string;
  toolName: string;
  category: ApprovalCategory;
  confidence: number;
  description: string;
  details: ApprovalDetails;
  expiresAt: Date;
  status: ApprovalStatus;
  createdAt: Date;
  decidedAt?: Date;
  decidedBy?: 'USER' | 'AUTO' | 'TIMEOUT';
  feedback?: string;
}

export interface ApprovalDetails {
  proposedAction: Record<string, unknown>;
  reasoning: string;
  impact: ApprovalImpact;
  isReversible: boolean;
  relatedEntities: RelatedEntity[];
}

export interface ApprovalImpact {
  type: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  affectedAreas: string[];
  estimatedCost?: { amount: number; currency: string };
  affectedContacts?: string[];
}

export interface RelatedEntity {
  type: 'email' | 'event' | 'contact' | 'task' | 'trip' | 'booking' | 'expense';
  id: string;
  displayName: string;
}

export interface ApprovalDecision {
  requestId: string;
  approved: boolean;
  feedback?: string;
  modifications?: Record<string, unknown>;
}

export interface ApprovalThresholds {
  autoApproveMinConfidence: number;
  requestApprovalMinConfidence: number;
  alwaysAskActions: string[];
  highImpactThresholds: {
    spendingLimit: number;
    vipContactImportance: number;
  };
}

export interface CreateApprovalInput {
  userId: string;
  agentType: string;
  action: string;
  toolName: string;
  category: ApprovalCategory;
  confidence: number;
  description: string;
  details: ApprovalDetails;
  expiresInMinutes?: number;
}

// ==================== STREAMING ====================

export type StreamChunkType =
  | 'text'
  | 'tool_use'
  | 'tool_call'
  | 'tool_input'
  | 'tool_result'
  | 'approval_request'
  | 'approval_required'
  | 'thinking'
  | 'complete'
  | 'connected'
  | 'done'
  | 'error';

export interface StreamChunk {
  type: StreamChunkType;
  content?: string;
  timestamp?: Date;
  toolName?: string;
  toolUse?: {
    id: string;
    name: string;
    input: Record<string, unknown>;
  };
  toolResult?: {
    toolUseId: string;
    result: unknown;
    isError?: boolean;
  };
  approvalRequest?: ApprovalRequest;
  thinking?: string;
  final?: EnhancedAgentResult<unknown>;
  error?: string;
}

// ==================== ORCHESTRATOR ====================

export interface OrchestratorDecision {
  intent: string;
  primaryAgent: AgentDomain;
  secondaryAgents?: AgentDomain[];
  confidence: number;
  parameters: Record<string, unknown>;
  reasoning: string;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  requiresMultiStep: boolean;
  workflow?: WorkflowDefinition;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description?: string;
  triggerConditions?: Record<string, unknown>;
  steps: WorkflowStep[];
  rollbackSteps?: WorkflowStep[];
}

export interface WorkflowStep {
  id: string;
  agent: AgentDomain;
  action: string;
  description?: string;
  dependsOn?: string[];
  input?: Record<string, unknown>;
  onFailure?: 'STOP' | 'CONTINUE' | 'ROLLBACK';
}

export interface MultiAgentResult {
  workflowId: string;
  status: 'COMPLETED' | 'PARTIAL' | 'FAILED' | 'PENDING_APPROVAL';
  stepResults: Map<string, EnhancedAgentResult<unknown>>;
  pendingApprovals: ApprovalRequest[];
  summary: string;
}

// ==================== RATE LIMITING ====================

export interface RateLimitStatus {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  limit: number;
}

export interface RateLimitConfig {
  maxCallsPerHour: number;
  windowMs: number;
}

// ==================== LEARNING ====================

export interface DetectedPattern {
  type: PatternType;
  description: string;
  confidence: number;
  dataPoints: number;
  suggestedAction?: string;
}

export interface CorrectionData {
  actionId: string;
  originalOutput: Record<string, unknown>;
  correctedOutput: Record<string, unknown>;
  reason?: string;
}

export interface CommunicationStyleInference {
  tone: 'FORMAL' | 'CASUAL' | 'MIXED';
  responseLength: 'CONCISE' | 'DETAILED';
  greetingStyle: string;
  signatureStyle: string;
  confidence: number;
}

export interface SchedulingPreferenceInference {
  preferredMeetingTimes: {
    morning: boolean;
    afternoon: boolean;
    evening: boolean;
  };
  bufferPreference: number;
  maxMeetingsPerDay: number;
  focusTimePreference: {
    enabled: boolean;
    preferredDays: number[];
    duration: number;
  };
  confidence: number;
}

// ==================== EXECUTION OPTIONS ====================

export interface ExecutionOptions {
  maxIterations?: number;
  timeout?: number;
  stream?: boolean;
  skipApproval?: boolean;
  forceApprovalCategory?: ApprovalCategory;
}

// ==================== AGENT MEMORY ====================

export interface AgentMemoryContext {
  recentActions: RecentAction[];
  patterns: UserPatternData[];
  relevantEntities: {
    contacts?: Array<{ id: string; name: string; importance: number }>;
    emails?: Array<{ id: string; subject: string; from: string }>;
    events?: Array<{ id: string; title: string; startTime: Date }>;
    tasks?: Array<{ id: string; title: string; priority: string }>;
  };
}

// ==================== AGENT BASE TYPES ====================

export interface AgentConfig {
  agentType: string;
  domain: AgentDomain;
  systemPrompt: string;
  tools: AgentTool[];
  maxIterations: number;
  defaultApprovalCategory: ApprovalCategory;
}

export interface AgentExecutionLog {
  agentType: string;
  action: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  toolsUsed: string[];
  confidence?: number;
  duration: number;
  status: 'SUCCESS' | 'FAILURE' | 'PENDING_APPROVAL' | 'REJECTED';
  error?: string;
  approvalId?: string;
}
