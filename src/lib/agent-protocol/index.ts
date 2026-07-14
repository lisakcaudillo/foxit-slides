// Agent Protocol — barrel export
export type { AgentCard, AgentMessage, AgentResponse } from './types';
export {
  registerAgent,
  getAgent,
  findAgentsByCapability,
  getAllAgents,
  updateAgentStatus,
} from './registry';
export {
  routeMessage,
  findBestAgent,
  registerHandler,
  createMessage,
  getMessageLog,
} from './router';
