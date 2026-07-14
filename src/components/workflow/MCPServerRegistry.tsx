'use client';

import { useState } from 'react';
import {
  X,
  Plus,
  Server,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Trash2,
  Power,
  PowerOff,
  Wrench,
  Lock,
} from 'lucide-react';
import type { MCPServer, MCPTool } from '@/types/mcp';

interface MCPServerRegistryProps {
  servers: MCPServer[];
  onServersChange: (servers: MCPServer[]) => void;
  onClose?: () => void;
}

function StatusBadge({ status }: { status: MCPServer['status'] }) {
  switch (status) {
    case 'connected':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
          <CheckCircle2 className="size-3" />
          Connected
        </span>
      );
    case 'disconnected':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-50 text-gray-600 border border-gray-200">
          <XCircle className="size-3" />
          Disconnected
        </span>
      );
    case 'auth-required':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
          <AlertTriangle className="size-3" />
          Auth Required
        </span>
      );
  }
}

function ToolListItem({ tool }: { tool: MCPTool }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600">
      <Wrench className="size-3 text-gray-400 flex-shrink-0" />
      <span className="font-medium text-gray-700">{tool.name}</span>
      <span className="text-gray-400">-</span>
      <span className="truncate">{tool.description}</span>
    </div>
  );
}

function ServerCard({
  server,
  onToggle,
  onRemove,
}: {
  server: MCPServer;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-gray-200 rounded-lg bg-white">
      <div className="flex items-center gap-3 px-4 py-3">
        <Server className="size-5 text-gray-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900">{server.name}</span>
            {server.isBuiltIn && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-teal-50 text-teal-700 border border-teal-200">
                Built-in
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 truncate">{server.endpointUrl}</p>
        </div>
        <StatusBadge status={server.status} />
        <button
          onClick={onToggle}
          className="size-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-500 transition-colors"
          title={server.status === 'connected' ? 'Disconnect' : 'Connect'}
        >
          {server.status === 'connected' ? (
            <PowerOff className="size-4" />
          ) : (
            <Power className="size-4" />
          )}
        </button>
        {!server.isBuiltIn && (
          <button
            onClick={onRemove}
            className="size-8 rounded-lg hover:bg-red-50 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors"
            title="Remove server"
          >
            <Trash2 className="size-4" />
          </button>
        )}
        <button
          onClick={() => setExpanded(!expanded)}
          className="size-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 transition-colors"
        >
          {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
      </div>
      {expanded && (
        <div className="border-t border-gray-100 py-2">
          <div className="px-4 py-1 text-xs font-medium text-gray-400 uppercase tracking-wide">
            Discovered Tools ({server.tools.length})
          </div>
          {server.tools.length > 0 ? (
            server.tools.map((tool) => <ToolListItem key={tool.name} tool={tool} />)
          ) : (
            <p className="px-4 py-2 text-sm text-gray-400 italic">No tools discovered yet</p>
          )}
          <div className="px-4 pt-2 flex items-center gap-4 text-xs text-gray-400">
            <span>Transport: {server.transport}</span>
            {server.authType && (
              <span className="flex items-center gap-1">
                <Lock className="size-3" />
                {server.authType}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface AddServerFormData {
  name: string;
  endpointUrl: string;
  transport: 'sse' | 'streamable-http';
}

function AddServerForm({ onAdd, onCancel }: { onAdd: (data: AddServerFormData) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [endpointUrl, setEndpointUrl] = useState('');
  const [transport, setTransport] = useState<'sse' | 'streamable-http'>('streamable-http');

  const canSubmit = name.trim().length > 0 && endpointUrl.trim().length > 0;

  return (
    <div className="border border-blue-200 rounded-lg bg-blue-50/50 p-4 space-y-3">
      <h4 className="font-medium text-gray-900 text-sm">Add MCP Server</h4>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Server Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., My Custom API"
          className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Endpoint URL</label>
        <input
          type="url"
          value={endpointUrl}
          onChange={(e) => setEndpointUrl(e.target.value)}
          placeholder="https://mcp.example.com/v1"
          className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Transport Mode</label>
        <select
          value={transport}
          onChange={(e) => setTransport(e.target.value as 'sse' | 'streamable-http')}
          className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
        >
          <option value="streamable-http">Streamable HTTP</option>
          <option value="sse">Server-Sent Events (SSE)</option>
        </select>
      </div>
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={() => {
            if (canSubmit) {
              onAdd({ name: name.trim(), endpointUrl: endpointUrl.trim(), transport });
            }
          }}
          disabled={!canSubmit}
          className="h-8 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-sm font-medium transition-colors"
        >
          Add Server
        </button>
        <button
          onClick={onCancel}
          className="h-8 px-4 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-medium transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function MCPServerRegistry({ servers, onServersChange, onClose }: MCPServerRegistryProps) {
  const [showAddForm, setShowAddForm] = useState(false);

  const handleToggle = (serverId: string) => {
    onServersChange(
      servers.map((s) => {
        if (s.id !== serverId) return s;
        return {
          ...s,
          status: s.status === 'connected' ? 'disconnected' as const : 'connected' as const,
        };
      })
    );
  };

  const handleRemove = (serverId: string) => {
    onServersChange(servers.filter((s) => s.id !== serverId));
  };

  const handleAdd = (data: AddServerFormData) => {
    const newServer: MCPServer = {
      id: `custom-${Date.now()}`,
      name: data.name,
      description: `Custom MCP server at ${data.endpointUrl}`,
      category: 'Storage',
      endpointUrl: data.endpointUrl,
      transport: data.transport,
      status: 'disconnected',
      isBuiltIn: false,
      authType: 'none',
      tools: [],
    };
    onServersChange([...servers, newServer]);
    setShowAddForm(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">MCP Server Registry</h2>
            <p className="text-sm text-gray-500">Manage connected MCP servers and their tools</p>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="size-9 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-500 transition-colors"
            >
              <X className="size-5" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {servers.map((server) => (
            <ServerCard
              key={server.id}
              server={server}
              onToggle={() => handleToggle(server.id)}
              onRemove={() => handleRemove(server.id)}
            />
          ))}

          {showAddForm ? (
            <AddServerForm onAdd={handleAdd} onCancel={() => setShowAddForm(false)} />
          ) : (
            <button
              onClick={() => setShowAddForm(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 text-sm text-gray-500 hover:text-blue-600 transition-all"
            >
              <Plus className="size-4" />
              Add MCP Server
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
