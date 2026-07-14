// MCP (Model Context Protocol) type definitions for Automation Builder integration

export type MCPServerCategory =
  | 'Storage'
  | 'Communication'
  | 'CRM'
  | 'Project Management'
  | 'Foxit';

export interface MCPServer {
  id: string;
  name: string;
  description: string;
  endpointUrl: string;
  transport: 'sse' | 'streamable-http';
  status: 'connected' | 'disconnected' | 'auth-required';
  tools: MCPTool[];
  isBuiltIn: boolean;
  authType?: 'oauth' | 'api-key' | 'none';
  category: MCPServerCategory;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  serverName: string;
  isAI?: boolean;
}
