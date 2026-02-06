import type {
  AgentTool,
  AgentDomain,
  RegisteredTool,
  ToolRegistry,
  ToolHandler,
  ApprovalCategory,
} from '../../types/agent.types.js';

/**
 * Global tool registry for all agent tools
 */
class ToolRegistryImpl implements ToolRegistry {
  tools: Map<string, RegisteredTool> = new Map();

  /**
   * Register a new tool
   */
  register(tool: RegisteredTool): void {
    if (this.tools.has(tool.definition.name)) {
      throw new Error(`Tool ${tool.definition.name} is already registered`);
    }
    this.tools.set(tool.definition.name, tool);
  }

  /**
   * Get a registered tool by name
   */
  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all tool definitions for a specific domain
   */
  getForDomain(domain: AgentDomain): AgentTool[] {
    const domainTools: AgentTool[] = [];
    for (const tool of this.tools.values()) {
      if (tool.domain === domain) {
        domainTools.push(tool.definition);
      }
    }
    return domainTools;
  }

  /**
   * Get all registered tools for a domain with their handlers
   */
  getHandlersForDomain(domain: AgentDomain): Map<string, RegisteredTool> {
    const result = new Map<string, RegisteredTool>();
    for (const [name, tool] of this.tools.entries()) {
      if (tool.domain === domain) {
        result.set(name, tool);
      }
    }
    return result;
  }

  /**
   * Check if a tool requires approval
   */
  requiresApproval(toolName: string): boolean {
    const tool = this.tools.get(toolName);
    return tool?.requiresApproval ?? false;
  }

  /**
   * Get the approval category for a tool
   */
  getApprovalCategory(toolName: string): ApprovalCategory {
    const tool = this.tools.get(toolName);
    return tool?.approvalCategory ?? 'AUTO_APPROVE';
  }

  /**
   * Execute a tool by name
   */
  async execute(
    toolName: string,
    input: Record<string, unknown>,
    context: import('../../types/agent.types.js').EnhancedAgentContext
  ): Promise<import('../../types/agent.types.js').ToolHandlerResult> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return {
        success: false,
        error: `Tool ${toolName} not found`,
      };
    }

    try {
      return await tool.handler(input, context);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error executing tool',
      };
    }
  }

  /**
   * Get all registered tool names
   */
  getAllToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Clear all registered tools (useful for testing)
   */
  clear(): void {
    this.tools.clear();
  }
}

// Singleton instance
export const toolRegistry = new ToolRegistryImpl();

/**
 * Helper to create a tool definition
 */
export function createTool(
  name: string,
  description: string,
  properties: Record<string, import('../../types/agent.types.js').ToolPropertySchema>,
  required: string[] = [],
  domain: AgentDomain,
  handler: ToolHandler,
  options: {
    requiresApproval?: boolean;
    approvalCategory?: ApprovalCategory;
  } = {}
): RegisteredTool {
  return {
    definition: {
      name,
      description,
      input_schema: {
        type: 'object',
        properties,
        required,
      },
    },
    handler,
    domain,
    requiresApproval: options.requiresApproval ?? false,
    approvalCategory: options.approvalCategory ?? 'AUTO_APPROVE',
  };
}

/**
 * Default approval categories for common actions
 */
export const DEFAULT_APPROVAL_CATEGORIES: Record<string, ApprovalCategory> = {
  // Auto-approve actions (low risk, high confidence)
  categorize_email: 'AUTO_APPROVE',
  summarize_email: 'AUTO_APPROVE',
  extract_action_items: 'AUTO_APPROVE',
  search_emails: 'AUTO_APPROVE',
  archive_emails: 'AUTO_APPROVE',
  set_follow_up_reminder: 'AUTO_APPROVE',
  find_available_slots: 'AUTO_APPROVE',
  add_buffer_time: 'AUTO_APPROVE',
  calculate_travel_time: 'AUTO_APPROVE',
  detect_conflicts: 'AUTO_APPROVE',
  optimize_day: 'AUTO_APPROVE',
  block_focus_time: 'AUTO_APPROVE',
  get_contact_profile: 'AUTO_APPROVE',
  update_contact: 'AUTO_APPROVE',
  log_interaction: 'AUTO_APPROVE',
  set_follow_up: 'AUTO_APPROVE',
  get_overdue_followups: 'AUTO_APPROVE',
  analyze_relationship: 'AUTO_APPROVE',
  find_contacts: 'AUTO_APPROVE',
  get_network_insights: 'AUTO_APPROVE',
  suggest_outreach: 'AUTO_APPROVE',
  search_flights: 'AUTO_APPROVE',
  search_hotels: 'AUTO_APPROVE',
  search_restaurants: 'AUTO_APPROVE',
  create_trip: 'AUTO_APPROVE',
  get_trip_itinerary: 'AUTO_APPROVE',
  estimate_ground_transport: 'AUTO_APPROVE',
  create_task: 'AUTO_APPROVE',
  update_task: 'AUTO_APPROVE',
  complete_task: 'AUTO_APPROVE',
  get_tasks: 'AUTO_APPROVE',
  prioritize_tasks: 'AUTO_APPROVE',
  suggest_time_blocks: 'AUTO_APPROVE',
  extract_tasks_from_text: 'AUTO_APPROVE',
  get_overdue_tasks: 'AUTO_APPROVE',
  generate_meeting_brief: 'AUTO_APPROVE',
  research_attendees: 'AUTO_APPROVE',
  get_email_history_with_attendees: 'AUTO_APPROVE',
  suggest_talking_points: 'AUTO_APPROVE',
  save_meeting_notes: 'AUTO_APPROVE',
  get_meeting_prep: 'AUTO_APPROVE',
  schedule_prep_reminder: 'AUTO_APPROVE',

  // Request approval actions (medium risk)
  draft_reply: 'AUTO_APPROVE',
  send_email: 'REQUEST_APPROVAL',
  schedule_meeting: 'REQUEST_APPROVAL',
  reschedule_meeting: 'REQUEST_APPROVAL',
  delete_task: 'REQUEST_APPROVAL',
  update_sender_importance: 'AUTO_APPROVE',

  // Always ask actions (high risk)
  cancel_meeting: 'ALWAYS_ASK',
  book_flight: 'ALWAYS_ASK',
  book_hotel: 'ALWAYS_ASK',
  cancel_booking: 'ALWAYS_ASK',
  delete_contact: 'ALWAYS_ASK',
};

// Export tool registration functions from individual modules
export { registerInboxTools } from './inbox.tools.js';
export { registerCalendarTools } from './calendar.tools.js';
export { registerCRMTools } from './crm.tools.js';
export { registerTravelTools } from './travel.tools.js';
export { registerTaskTools } from './task.tools.js';
export { registerMeetingPrepTools } from './meetingprep.tools.js';

/**
 * Register all tools from all domains
 */
export async function registerAllTools(): Promise<void> {
  const { registerInboxTools } = await import('./inbox.tools.js');
  const { registerCalendarTools } = await import('./calendar.tools.js');
  const { registerCRMTools } = await import('./crm.tools.js');
  const { registerTravelTools } = await import('./travel.tools.js');
  const { registerTaskTools } = await import('./task.tools.js');
  const { registerMeetingPrepTools } = await import('./meetingprep.tools.js');

  registerInboxTools();
  registerCalendarTools();
  registerCRMTools();
  registerTravelTools();
  registerTaskTools();
  registerMeetingPrepTools();
}

export default toolRegistry;
