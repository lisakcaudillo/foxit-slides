'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Zap,
  FileText,
  Brain,
  CheckCircle,
  Link2,
  Settings,
  X,
  Server,
  Loader2,
  Check,
  XCircle,
  HardDrive,
  Mail,
  Users,
  BookOpen,
  ClipboardList,
  BarChart,
  Cloud,
  Package,
  MessageSquare,
  PenTool,
  PlayCircle,
  Cog,
  GitBranch,
  MoreHorizontal,
  Copy,
  Clipboard,
  Trash2,
  ArrowLeftToLine,
  ArrowRightToLine,
  Type,
} from 'lucide-react';
import type { ComponentType } from 'react';

export type WorkflowNodeStatus = 'idle' | 'pending' | 'running' | 'success' | 'failed';

export interface WorkflowNodeData {
  id: string;
  type: string;
  label: string;
  x: number;
  y: number;
  category: string;
  isMCP?: boolean;
  mcpServerName?: string;
  mcpToolName?: string;
  status?: WorkflowNodeStatus;
  assignee?: string;
  goal?: string;
}

const categoryColors: Record<string, string> = {
  triggers: 'from-sky-500 to-sky-600',           // blue — events/inputs
  actions: 'from-orange-500 to-orange-600',       // orange — do this
  pdf: 'from-orange-500 to-orange-600',           // orange — Foxit PDF actions
  ai: 'from-violet-500 to-violet-600',            // violet — AI-powered
  'foxit-action': 'from-orange-500 to-orange-600', // orange — Foxit actions
  review: 'from-emerald-500 to-emerald-600',      // green — approval/validation
  condition: 'from-amber-500 to-amber-600',       // amber — decisions
  utilities: 'from-slate-500 to-slate-600',       // gray — helper steps
  integrations: 'from-rose-500 to-rose-600',      // pink — external
  starter: 'from-indigo-500 to-indigo-600',       // indigo — starter nodes
};

const mcpGradient = 'from-teal-500 to-teal-600';

const APP_LOGOS: Record<string, string> = {
  'Foxit': 'https://www.foxit.com/favicon.ico',
  'Google Drive': 'https://ssl.gstatic.com/docs/doclist/images/drive_2022q3_32dp.png',
  'Gmail': 'https://ssl.gstatic.com/ui/v1/icons/mail/rfr/gmail.ico',
  'HubSpot': 'https://www.hubspot.com/favicon.ico',
  'Notion': 'https://www.notion.so/images/favicon.ico',
  'Jira': 'https://wac-cdn.atlassian.com/assets/img/favicons/atlassian/favicon.png',
  'Salesforce': 'https://www.salesforce.com/favicon.ico',
  'Dropbox': 'https://cfl.dropboxstatic.com/static/images/favicon-vfl8lUR9B.ico',
  'Box': 'https://www.box.com/favicon.ico',
  'Slack': 'https://a.slack-edge.com/80588/marketing/img/meta/favicon-32.png',
  'Asana': 'https://d3ki9tyy5l5ruj.cloudfront.net/obj/favicon/asana-brand-mark.ico',
};

const categoryIcons: Record<string, ComponentType<{ className?: string }>> = {
  triggers: Zap,
  pdf: FileText,
  ai: Brain,
  review: CheckCircle,
  condition: GitBranch,
  integrations: Link2,
  starter: PlayCircle,
};

/** Map MCP server names to specific lucide icons */
const mcpServerIcons: Record<string, ComponentType<{ className?: string }>> = {
  'Google Drive': HardDrive,
  'Gmail': Mail,
  'HubSpot': Users,
  'Notion': BookOpen,
  'Jira': ClipboardList,
  'Salesforce': BarChart,
  'Dropbox': Cloud,
  'Box': Package,
  'Slack': MessageSquare,
  'Asana': CheckCircle,
  'Foxit PDF Services': FileText,
  'Foxit eSign': PenTool,
};

/** PRD Section 14: plain-language node type labels */
const categoryLabels: Record<string, string> = {
  triggers: 'When this happens',
  actions: 'Do this',
  pdf: 'Do this',
  ai: 'AI',
  'foxit-action': 'Do this',
  review: 'Review',
  condition: 'But only if',
  utilities: 'Utility',
  integrations: 'Integration',
  starter: 'Start here',
};

interface MCPConfigModalProps {
  node: WorkflowNodeData;
  onClose: () => void;
}

function MCPConfigModal({ node, onClose }: MCPConfigModalProps) {
  const MCPIcon = (node.mcpServerName && mcpServerIcons[node.mcpServerName]) || Server;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h3 className="font-semibold text-gray-900 text-sm">{node.label}</h3>
            <p className="text-xs text-gray-500">MCP Tool Configuration</p>
          </div>
          <button
            onClick={onClose}
            className="size-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-500"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          {node.mcpServerName && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Server</label>
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-teal-50 border border-teal-200">
                <MCPIcon className="size-4 text-teal-600" />
                <span className="text-sm text-teal-700 font-medium">{node.mcpServerName}</span>
              </div>
            </div>
          )}
          {node.mcpToolName && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Tool</label>
              <div className="px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm text-gray-700 font-mono">
                {node.mcpToolName}
              </div>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Input Parameters</label>
            <p className="text-xs text-gray-500 italic">
              Parameters are auto-generated from the tool schema at runtime. Configure input bindings when connecting nodes.
            </p>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
          <button
            onClick={onClose}
            className="h-8 px-4 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

interface WorkflowNodeProps {
  node: WorkflowNodeData;
  isSelected?: boolean;
  onSelect?: (nodeId: string, additive: boolean) => void;
  onRemove?: () => void;
  onCopy?: () => void;
  onPaste?: () => void;
  onMoveNode?: (nodeId: string, x: number, y: number) => void;
  onConnectionStart?: (nodeId: string) => void;
  onConnectionEnd?: (nodeId: string) => void;
  onConfigure?: (nodeId: string) => void;
  isConnecting?: boolean;
  onDuplicate?: () => void;
  onInsertBefore?: () => void;
  onInsertAfter?: () => void;
  onRename?: (newLabel: string) => void;
  onDragConnectionStart?: (nodeId: string, startX: number, startY: number) => void;
  onDragConnectionEnd?: (nodeId: string) => void;
}

function statusBorderClass(status: WorkflowNodeStatus | undefined): string {
  switch (status) {
    case 'pending':
      return 'border-gray-300 animate-pulse';
    case 'running':
      return 'border-sky-400 border-2 shadow-sky-100';
    case 'success':
      return 'border-green-400 border-2 shadow-green-100';
    case 'failed':
      return 'border-red-400 border-2 shadow-red-100';
    default:
      return '';
  }
}

function StatusIndicator({ status }: { status: WorkflowNodeStatus | undefined }) {
  switch (status) {
    case 'pending':
      return (
        <div className="size-5 rounded-full bg-gray-200 flex items-center justify-center">
          <div className="size-2 rounded-full bg-gray-400" />
        </div>
      );
    case 'running':
      return (
        <div className="size-5 rounded-full bg-blue-100 flex items-center justify-center">
          <Loader2 className="size-3 text-violet-600 animate-spin" />
        </div>
      );
    case 'success':
      return (
        <div className="size-5 rounded-full bg-green-100 flex items-center justify-center">
          <Check className="size-3 text-green-600" />
        </div>
      );
    case 'failed':
      return (
        <div className="size-5 rounded-full bg-red-100 flex items-center justify-center">
          <XCircle className="size-3 text-red-600" />
        </div>
      );
    default:
      return null;
  }
}

export { mcpServerIcons };

export function WorkflowNode({ node, isSelected, onSelect, onRemove, onCopy, onPaste, onMoveNode, onConnectionStart, onConnectionEnd, onConfigure, isConnecting, onDuplicate, onInsertBefore, onInsertAfter, onRename, onDragConnectionStart, onDragConnectionEnd }: WorkflowNodeProps) {
  const [showConfig, setShowConfig] = useState(false);
  const [isGrabbing, setIsGrabbing] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(node.label);
  const isDragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const isMCP = node.isMCP === true;
  const isFoxit = node.category === 'pdf';
  const isAppNode = isMCP || isFoxit;
  const hasAssignee = node.assignee && node.assignee !== 'system';
  const Icon = isMCP
    ? ((node.mcpServerName && mcpServerIcons[node.mcpServerName]) || Server)
    : isFoxit
      ? FileText
      : (categoryIcons[node.category] || Zap);
  const gradientClass = hasAssignee
    ? 'from-violet-500 to-violet-600'
    : isMCP ? mcpGradient : (categoryColors[node.category] || categoryColors.triggers);
  const nodeStatus = node.status ?? 'idle';
  const statusBorder = statusBorderClass(nodeStatus);
  const defaultBorder = isMCP ? 'border-teal-200' : 'border-gray-200';

  // Fix 2: App name is prominent for MCP/Foxit nodes
  const headerLabel = isMCP && node.mcpServerName
    ? node.mcpServerName
    : isFoxit
      ? 'Foxit'
      : (categoryLabels[node.category] ?? 'Do this');

  // Resolve app logo for the node header
  const logoUrl = isMCP && node.mcpServerName
    ? APP_LOGOS[node.mcpServerName]
    : isFoxit
      ? APP_LOGOS['Foxit']
      : undefined;
  // Secondary label: tool name for app nodes, original label for others
  const bodyLabel = isAppNode ? node.label : node.label;

  const nodeRef = useRef<HTMLDivElement>(null);
  const dragStartPos = useRef({ x: 0, y: 0 });

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Don't start drag if clicking a button or connection point
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('[data-connection-point]')) return;

    // Select node on click (Cmd/Ctrl for additive multi-select)
    onSelect?.(node.id, e.metaKey || e.ctrlKey);

    e.preventDefault();
    isDragging.current = true;
    setIsGrabbing(true);
    dragOffset.current = {
      x: e.clientX - node.x,
      y: e.clientY - node.y,
    };
    dragStartPos.current = { x: node.x, y: node.y };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDragging.current || !nodeRef.current) return;
      const newX = Math.max(0, moveEvent.clientX - dragOffset.current.x);
      const newY = Math.max(0, moveEvent.clientY - dragOffset.current.y);
      // Use CSS transform for visual position during drag (no React re-render)
      const dx = newX - dragStartPos.current.x;
      const dy = newY - dragStartPos.current.y;
      nodeRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      isDragging.current = false;
      setIsGrabbing(false);
      if (nodeRef.current) {
        nodeRef.current.style.transform = '';
      }
      // Commit final position to React state
      const rawX = Math.max(0, upEvent.clientX - dragOffset.current.x);
      const rawY = Math.max(0, upEvent.clientY - dragOffset.current.y);
      // Snap to grid on release
      const GRID = 100;
      const SNAP = 40;
      const snap = (v: number) => { const n = Math.round(v / GRID) * GRID; return Math.abs(v - n) < SNAP ? n : v; };
      onMoveNode?.(node.id, snap(rawX), snap(rawY));
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [node.id, node.x, node.y, onMoveNode]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isDragging.current = false;
    };
  }, []);

  // Close context menu on outside click
  useEffect(() => {
    if (!showContextMenu) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setShowContextMenu(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showContextMenu]);

  // Sync rename value when node label changes externally
  useEffect(() => {
    setRenameValue(node.label);
  }, [node.label]);

  const handleRenameSubmit = useCallback(() => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== node.label) {
      onRename?.(trimmed);
    } else {
      setRenameValue(node.label);
    }
    setIsRenaming(false);
  }, [renameValue, node.label, onRename]);

  const handleOutputPortMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    // Start drag connection from output port
    const portX = node.x + 200;
    const portY = node.y + 40;
    onDragConnectionStart?.(node.id, portX, portY);
  }, [node.id, node.x, node.y, onDragConnectionStart]);

  const handleInputPortMouseUp = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onDragConnectionEnd?.(node.id);
  }, [node.id, onDragConnectionEnd]);

  return (
    <>
      <div
        ref={nodeRef}
        onMouseDown={handleMouseDown}
        style={{
          position: 'absolute',
          left: node.x,
          top: node.y,
          willChange: 'transform',
        }}
        className={
          'w-[200px] bg-white rounded-xl border shadow-sm hover:shadow-md transition-shadow group select-none ' +
          (isGrabbing ? 'cursor-grabbing ' : 'cursor-grab ') +
          (isSelected ? 'ring-2 ring-violet-500 border-violet-400 ' : '') +
          (statusBorder || defaultBorder)
        }
      >
        {/* Header */}
        <div className={
          (logoUrl
            ? 'h-8 rounded-t-xl bg-gray-50 border-b border-gray-200 flex items-center justify-between px-2.5'
            : 'h-8 rounded-t-xl bg-gradient-to-r flex items-center justify-between px-2.5 ' + gradientClass)
        }>
          <div className="flex items-center gap-1.5 min-w-0">
            {logoUrl ? (
              <img src={logoUrl} alt={headerLabel} className="size-4 rounded flex-shrink-0" />
            ) : (
              <Icon className="size-3.5 text-white flex-shrink-0" />
            )}
            <span className={`text-xs font-semibold truncate ${logoUrl ? 'text-slate-900' : 'text-white'}`}>{headerLabel}</span>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onRemove?.(); }}
            className="size-4 rounded hover:bg-white/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
          >
            <X className={`size-3 ${logoUrl ? 'text-gray-500' : 'text-white'}`} />
          </button>
        </div>

        {/* Gear icon and context menu button — top-right corner, hover-only */}
        <div className="absolute top-10 right-1.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (isMCP) {
                setShowConfig(true);
              } else {
                onConfigure?.(node.id);
              }
            }}
            className="p-1 rounded hover:bg-gray-100"
          >
            <Settings className="size-4 text-gray-300 hover:text-gray-600 transition-colors" />
          </button>
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowContextMenu((prev) => !prev);
              }}
              className="p-1 rounded hover:bg-gray-100"
            >
              <MoreHorizontal className="size-4 text-gray-300 hover:text-gray-600 transition-colors" />
            </button>
            {showContextMenu && (
              <div
                ref={contextMenuRef}
                className="absolute right-0 top-7 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 w-40"
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowContextMenu(false);
                    onDuplicate?.();
                  }}
                  className="w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  <Copy className="size-3.5" />
                  Duplicate
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowContextMenu(false);
                    onCopy?.();
                  }}
                  className="w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  <Clipboard className="size-3.5" />
                  Copy
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowContextMenu(false);
                    onPaste?.();
                  }}
                  className="w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  <Clipboard className="size-3.5" />
                  Paste
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowContextMenu(false);
                    onInsertBefore?.();
                  }}
                  className="w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  <ArrowLeftToLine className="size-3.5" />
                  Add before
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowContextMenu(false);
                    onInsertAfter?.();
                  }}
                  className="w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  <ArrowRightToLine className="size-3.5" />
                  Add after
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowContextMenu(false);
                    setIsRenaming(true);
                  }}
                  className="w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  <Type className="size-3.5" />
                  Rename
                </button>
                <div className="border-t border-gray-100 my-1" />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowContextMenu(false);
                    onRemove?.();
                  }}
                  className="w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                >
                  <Trash2 className="size-3.5" />
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="px-3 py-2">
          <div className="flex items-center gap-1.5">
            {isRenaming ? (
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={handleRenameSubmit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRenameSubmit();
                  if (e.key === 'Escape') {
                    setRenameValue(node.label);
                    setIsRenaming(false);
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                className="flex-1 font-medium text-gray-900 bg-white border border-violet-400 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500/30"
              />
            ) : (
              <h4 className="font-medium text-gray-900 flex-1 text-xs truncate">{bodyLabel}</h4>
            )}
            <StatusIndicator status={nodeStatus} />
          </div>
        </div>

        {/* Connection points */}
        <div
          data-connection-point="input"
          onClick={(e) => { e.stopPropagation(); onConnectionEnd?.(node.id); }}
          onMouseUp={handleInputPortMouseUp}
          className={
            'absolute -left-2.5 top-1/2 -translate-y-1/2 size-6 rounded-full bg-white border-2 transition-all cursor-pointer z-10 ' +
            (isConnecting ? 'border-violet-600 bg-violet-100 animate-pulse scale-125' : 'border-gray-300 hover:border-violet-500 hover:bg-violet-50 hover:scale-110')
          }
        />
        <div
          data-connection-point="output"
          onClick={(e) => { e.stopPropagation(); onConnectionStart?.(node.id); }}
          onMouseDown={handleOutputPortMouseDown}
          className="absolute -right-2.5 top-1/2 -translate-y-1/2 size-6 rounded-full bg-white border-2 transition-all cursor-pointer z-10 border-gray-300 hover:border-violet-500 hover:bg-violet-50 hover:scale-110"
        />
      </div>

      {/* MCP Config Modal */}
      {showConfig && isMCP && (
        <MCPConfigModal node={node} onClose={() => setShowConfig(false)} />
      )}
    </>
  );
}
