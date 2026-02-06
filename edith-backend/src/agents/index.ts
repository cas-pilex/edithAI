// AI Agents
export { BaseAgent } from './BaseAgent.js';
export { OrchestratorAgent, orchestratorAgent } from './OrchestratorAgent.js';
export { InboxAgent, inboxAgent } from './InboxAgent.js';
export { CalendarAgent, calendarAgent } from './CalendarAgent.js';
export { CRMAgent, crmAgent } from './CRMAgent.js';
export { TravelAgent, travelAgent } from './TravelAgent.js';
export { TaskAgent, taskAgent } from './TaskAgent.js';
export { MeetingPrepAgent, meetingPrepAgent } from './MeetingPrepAgent.js';

// Tool Registry
export { toolRegistry, registerAllTools, createTool } from './tools/index.js';
export { registerInboxTools } from './tools/inbox.tools.js';
export { registerCalendarTools } from './tools/calendar.tools.js';
export { registerCRMTools } from './tools/crm.tools.js';
export { registerTravelTools } from './tools/travel.tools.js';
export { registerTaskTools } from './tools/task.tools.js';
export { registerMeetingPrepTools } from './tools/meetingprep.tools.js';

// Agent registry for dynamic access
export const agents = {
  inbox: () => import('./InboxAgent.js').then(m => m.inboxAgent),
  calendar: () => import('./CalendarAgent.js').then(m => m.calendarAgent),
  crm: () => import('./CRMAgent.js').then(m => m.crmAgent),
  travel: () => import('./TravelAgent.js').then(m => m.travelAgent),
  tasks: () => import('./TaskAgent.js').then(m => m.taskAgent),
  meeting_prep: () => import('./MeetingPrepAgent.js').then(m => m.meetingPrepAgent),
  orchestrator: () => import('./OrchestratorAgent.js').then(m => m.orchestratorAgent),
};

export type AgentName = keyof typeof agents;
