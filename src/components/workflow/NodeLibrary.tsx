'use client';

import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import {
  Zap,
  FileText,
  Brain,
  CheckCircle,
  Link2,
  Upload,
  FileCheck,
  FilePlus,
  Wand2,
  MessageSquare,
  GitMerge,
  Mail,
  Search,
  Settings,
  HardDrive,
  Users,
  BookOpen,
  ClipboardList,
  BarChart,
  Cloud,
  Package,
  PenTool,
  FileOutput,
  LayoutTemplate,
  GripVertical,
  GitBranch,
  ShieldCheck,
  Clock,
  Webhook,
  Timer,
  Variable,
  Globe,
  Minimize2,
  ScanEye,
  FileSearch,
  Pen,
  ChevronRight,
  Sparkles,
  Play,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { defaultMCPServers } from '@/data/mcpServers';
import type { MCPTool } from '@/types/mcp';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface NodeType {
  id: string;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  category: CategoryId;
  subGroup?: ActionSubGroup;
  isMCP?: boolean;
  mcpServerName?: string;
  mcpTool?: MCPTool;
}

type CategoryId = 'triggers' | 'actions' | 'conditions' | 'utilities';
type ActionSubGroup = 'foxit' | 'ai' | 'review';

type SelectableId = CategoryId | ActionSubGroup | string;

interface CategoryListItem {
  kind: 'category' | 'sub-category' | 'app' | 'section-header';
  id: SelectableId;
  label: string;
  icon?: ComponentType<{ className?: string }>;
}

/* ------------------------------------------------------------------ */
/*  MCP server icon maps                                               */
/* ------------------------------------------------------------------ */

const mcpServerNameIconMap: Record<string, ComponentType<{ className?: string }>> = {
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

const APP_LOGOS: Record<string, string> = {
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
  'Foxit': 'https://www.foxit.com/favicon.ico',
};

/* ------------------------------------------------------------------ */
/*  Static node definitions                                            */
/* ------------------------------------------------------------------ */

const triggerNodes: NodeType[] = [
  { id: 'upload', label: 'New document', description: 'Trigger on document upload', icon: Upload, category: 'triggers' },
  { id: 'document-signed', label: 'Document signed', description: 'Trigger when a document is signed', icon: PenTool, category: 'triggers' },
  { id: 'schedule', label: 'Schedule', description: 'Run on a time schedule', icon: Clock, category: 'triggers' },
  { id: 'webhook', label: 'Incoming webhook', description: 'Trigger from external webhook', icon: Webhook, category: 'triggers' },
];

const actionNodes: NodeType[] = [
  { id: 'foxit-convert-to-pdf', label: 'Convert to PDF', description: 'Convert a file into PDF format', icon: FileText, category: 'actions', subGroup: 'foxit' },
  { id: 'foxit-merge', label: 'Merge', description: 'Combine multiple PDFs into one', icon: GitMerge, category: 'actions', subGroup: 'foxit' },
  { id: 'foxit-split', label: 'Split', description: 'Split a PDF into parts', icon: FilePlus, category: 'actions', subGroup: 'foxit' },
  { id: 'foxit-compress', label: 'Compress', description: 'Reduce PDF file size', icon: Minimize2, category: 'actions', subGroup: 'foxit' },
  { id: 'foxit-extract', label: 'Extract', description: 'Pull text or images from a PDF', icon: FileSearch, category: 'actions', subGroup: 'foxit' },
  { id: 'foxit-compare', label: 'Compare', description: 'Compare two PDF documents', icon: FileCheck, category: 'actions', subGroup: 'foxit' },
  { id: 'foxit-ocr', label: 'OCR', description: 'Extract text from scanned documents', icon: ScanEye, category: 'actions', subGroup: 'foxit' },
  { id: 'foxit-send-for-signature', label: 'Send for Signature', description: 'Send a document for electronic signature', icon: Pen, category: 'actions', subGroup: 'foxit' },
  { id: 'esign-send-template', label: 'Send from Template', description: 'Create envelope from eSign template', icon: Pen, category: 'actions', subGroup: 'foxit' },
  { id: 'esign-check-status', label: 'Check Signing Status', description: 'Check if envelope is signed', icon: Pen, category: 'actions', subGroup: 'foxit' },
  { id: 'esign-download', label: 'Download Signed', description: 'Download the signed document', icon: Pen, category: 'actions', subGroup: 'foxit' },
  { id: 'esign-reminder', label: 'Send Reminder', description: 'Send signing reminder to signers', icon: Pen, category: 'actions', subGroup: 'foxit' },
  { id: 'esign-cancel', label: 'Cancel Envelope', description: 'Cancel a pending signing envelope', icon: Pen, category: 'actions', subGroup: 'foxit' },
  { id: 'foxit-watermark', label: 'Watermark', description: 'Add watermark to PDF', icon: FileText, category: 'actions', subGroup: 'foxit' },
  { id: 'foxit-protect', label: 'Protect', description: 'Add password protection', icon: FileText, category: 'actions', subGroup: 'foxit' },
  { id: 'foxit-flatten', label: 'Flatten', description: 'Flatten forms and annotations', icon: FileText, category: 'actions', subGroup: 'foxit' },
  { id: 'foxit-form-import', label: 'Import Form Data', description: 'Fill PDF forms from JSON', icon: FileText, category: 'actions', subGroup: 'foxit' },
  { id: 'foxit-form-export', label: 'Export Form Data', description: 'Export form values as JSON', icon: FileText, category: 'actions', subGroup: 'foxit' },
  { id: 'foxit-properties', label: 'Get Properties', description: 'Read PDF metadata', icon: FileText, category: 'actions', subGroup: 'foxit' },
  { id: 'foxit-generate-pdf', label: 'Generate PDF', description: 'Create a new PDF from template', icon: FileOutput, category: 'actions', subGroup: 'foxit' },
  { id: 'foxit-generate-word', label: 'Generate Word', description: 'Create a Word document from template', icon: FileOutput, category: 'actions', subGroup: 'foxit' },
  { id: 'foxit-analyze-template', label: 'Analyze Template', description: 'Inspect template fields and structure', icon: LayoutTemplate, category: 'actions', subGroup: 'foxit' },
  { id: 'ai-summarize', label: 'Summarize', description: 'Generate a document summary', icon: MessageSquare, category: 'actions', subGroup: 'ai' },
  { id: 'ai-classify', label: 'Classify', description: 'Classify document type or content', icon: Search, category: 'actions', subGroup: 'ai' },
  { id: 'ai-rewrite', label: 'Rewrite', description: 'Rewrite or rephrase document content', icon: Wand2, category: 'actions', subGroup: 'ai' },
  { id: 'ai-extract-fields', label: 'Extract fields', description: 'Extract structured fields from a document', icon: Brain, category: 'actions', subGroup: 'ai' },
  { id: 'ai-check-sensitive', label: 'Check sensitive info', description: 'Detect PII and sensitive content', icon: ShieldCheck, category: 'actions', subGroup: 'ai' },
  { id: 'review-approval', label: 'Get approval', description: 'Route for human approval', icon: CheckCircle, category: 'actions', subGroup: 'review' },
  { id: 'review-validate', label: 'Validate', description: 'Validate document fields', icon: FileCheck, category: 'actions', subGroup: 'review' },
];

const conditionNodes: NodeType[] = [
  { id: 'cond-if', label: 'If', description: 'Check a condition and branch', icon: GitBranch, category: 'conditions' },
  { id: 'cond-and', label: 'And', description: 'All conditions must be true', icon: GitBranch, category: 'conditions' },
  { id: 'cond-or', label: 'Or', description: 'Any condition must be true', icon: GitBranch, category: 'conditions' },
  { id: 'cond-else', label: 'Else', description: 'The "no" path when condition fails', icon: GitBranch, category: 'conditions' },
  { id: 'cond-boolean', label: 'Boolean', description: 'True/false check on a value', icon: GitBranch, category: 'conditions' },
  { id: 'if-value-equals', label: 'If value equals', description: 'Branch when a field matches a value', icon: GitBranch, category: 'conditions' },
  { id: 'if-approved', label: 'If approved', description: 'Branch when approval is granted', icon: CheckCircle, category: 'conditions' },
];

const utilityNodes: NodeType[] = [
  { id: 'delay', label: 'Delay', description: 'Wait for a specified duration', icon: Timer, category: 'utilities' },
  { id: 'set-variable', label: 'Set variable', description: 'Store a value for later steps', icon: Variable, category: 'utilities' },
  { id: 'http-request', label: 'HTTP request', description: 'Make an external API call', icon: Globe, category: 'utilities' },
];

/* ------------------------------------------------------------------ */
/*  Build Connected Apps nodes from MCP servers                        */
/* ------------------------------------------------------------------ */

function buildConnectedAppNodes(): NodeType[] {
  const nodes: NodeType[] = [];
  for (const server of defaultMCPServers) {
    if (server.isBuiltIn) continue;
    const ToolIcon = mcpServerNameIconMap[server.name] ?? FileText;
    for (const tool of server.tools) {
      const label = tool.name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      nodes.push({
        id: `mcp-${server.id}-${tool.name}`,
        label,
        description: tool.description,
        icon: ToolIcon,
        category: 'actions' as CategoryId,
        isMCP: true,
        mcpServerName: server.name,
        mcpTool: tool,
      });
    }
  }
  return nodes;
}

const connectedAppNodes = buildConnectedAppNodes();

const allNodeTypes: NodeType[] = [
  ...triggerNodes,
  ...actionNodes,
  ...conditionNodes,
  ...utilityNodes,
  ...connectedAppNodes,
];

/* ------------------------------------------------------------------ */
/*  Connected app servers (non-built-in)                               */
/* ------------------------------------------------------------------ */

const connectedAppServers = defaultMCPServers
  .filter((s) => !s.isBuiltIn)
  .map((s) => ({
    id: s.id,
    name: s.name,
    icon: mcpServerNameIconMap[s.name] ?? FileText,
  }));

const foxitAppServers = defaultMCPServers
  .filter((s) => s.isBuiltIn)
  .map((s) => ({
    id: s.id,
    name: s.name,
    icon: mcpServerNameIconMap[s.name] ?? FileText,
  }));

const allAppServers = connectedAppServers;

/* ------------------------------------------------------------------ */
/*  Build the category list items                                      */
/* ------------------------------------------------------------------ */

const categoryListItems: CategoryListItem[] = [
  { kind: 'category', id: 'triggers', label: 'Triggers', icon: Zap },
  { kind: 'category', id: 'actions', label: 'Actions', icon: Play },
  { kind: 'category', id: 'conditions', label: 'Conditions', icon: GitBranch },
  { kind: 'category', id: 'utilities', label: 'Utilities', icon: Settings },
  { kind: 'section-header', id: 'connected-apps-header', label: 'Connected Apps' },
  ...allAppServers.map((s): CategoryListItem => ({
    kind: 'app',
    id: s.id,
    label: s.name,
    icon: s.icon,
  })),
];

/* ------------------------------------------------------------------ */
/*  Resolve nodes for a selected id                                    */
/* ------------------------------------------------------------------ */

function getNodesForSelection(selectionId: SelectableId): NodeType[] {
  switch (selectionId) {
    case 'triggers':
      return triggerNodes;
    case 'actions':
      return actionNodes;
    case 'conditions':
      return conditionNodes;
    case 'utilities':
      return utilityNodes;
    default: {
      const server = defaultMCPServers.find((s) => s.id === selectionId);
      if (!server) return [];
      return connectedAppNodes.filter((n) => n.mcpServerName === server.name);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Icon color helpers                                                 */
/* ------------------------------------------------------------------ */

function nodeIconColor(node: NodeType): string {
  if (node.isMCP) return 'bg-emerald-50 text-emerald-600';
  switch (node.category) {
    case 'triggers': return 'bg-sky-50 text-sky-600';
    case 'actions': return 'bg-violet-50 text-violet-600';
    case 'conditions': return 'bg-amber-50 text-amber-600';
    case 'utilities': return 'bg-slate-100 text-slate-600';
  }
}

/* ------------------------------------------------------------------ */
/*  DraggableNode                                                      */
/* ------------------------------------------------------------------ */

function DraggableNode({ node }: { node: NodeType }) {
  const Icon = node.icon;
  const colorClasses = nodeIconColor(node);
  const [bgClass, textClass] = colorClasses.split(' ');

  return (
    <div
      draggable
      title="Drag to canvas"
      onDragStart={(e) => {
        e.dataTransfer.setData(
          'application/json',
          JSON.stringify({
            nodeType: {
              id: node.id,
              label: node.label,
              category: node.category,
              isMCP: node.isMCP ?? false,
              mcpServerName: node.mcpServerName,
              mcpToolName: node.mcpTool?.name,
            },
          })
        );
        e.dataTransfer.effectAllowed = 'copy';
      }}
      className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-grab active:cursor-grabbing transition-all"
    >
      <GripVertical className="size-3.5 text-slate-300 flex-shrink-0" />
      <div
        className={
          'size-7 rounded-md flex items-center justify-center flex-shrink-0 ' + bgClass
        }
      >
        <Icon className={'size-3.5 ' + textClass} />
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-sm text-slate-700 font-medium block truncate">
          {node.label}
          {node.id.startsWith('ai_') && <Sparkles className="inline size-3 text-violet-500 ml-1" />}
        </span>
        <span className="text-[11px] text-gray-500 block truncate leading-tight">{node.description}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  FlyoutPanel                                                        */
/* ------------------------------------------------------------------ */

interface FlyoutPanelProps {
  nodes: NodeType[];
  topOffset: number;
  leftOffset: number;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

function FlyoutPanel({ nodes, topOffset, leftOffset, onMouseEnter, onMouseLeave }: FlyoutPanelProps) {
  return (
    <div
      className="fixed z-50 bg-white rounded-lg shadow-lg border border-gray-200 w-[250px] max-h-[300px] overflow-y-auto"
      style={{ left: `${leftOffset}px`, top: `${topOffset}px` }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="p-1.5 space-y-0.5">
        {nodes.map((node) => (
          <DraggableNode key={node.id} node={node} />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  NodeLibrary (exported)                                             */
/* ------------------------------------------------------------------ */

export function NodeLibrary() {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeId, setActiveId] = useState<SelectableId | null>(null);
  const [flyoutTop, setFlyoutTop] = useState<number>(0);
  const [flyoutLeft, setFlyoutLeft] = useState<number>(280);
  const panelRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInFlyoutRef = useRef(false);
  const isInRowRef = useRef(false);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return null;
    return allNodeTypes.filter(
      (node) =>
        node.label.toLowerCase().includes(q) ||
        node.description.toLowerCase().includes(q) ||
        (node.mcpServerName && node.mcpServerName.toLowerCase().includes(q))
    );
  }, [searchQuery]);

  const isSearching = searchResults !== null;

  const activeNodes = activeId ? getNodesForSelection(activeId) : [];

  const closeFlyout = useCallback(() => {
    hoverTimeoutRef.current = setTimeout(() => {
      if (!isInFlyoutRef.current && !isInRowRef.current) {
        setActiveId(null);
      }
    }, 100);
  }, []);

  const clearCloseTimeout = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  const handleRowMouseEnter = useCallback(
    (id: SelectableId, e: React.MouseEvent<HTMLButtonElement>) => {
      clearCloseTimeout();
      isInRowRef.current = true;
      const panelRect = panelRef.current?.getBoundingClientRect();
      const rowRect = e.currentTarget.getBoundingClientRect();
      if (panelRect) {
        setFlyoutTop(rowRect.top); setFlyoutLeft(panelRect.right);
      }
      setActiveId(id);
    },
    [clearCloseTimeout]
  );

  const handleRowMouseLeave = useCallback(() => {
    isInRowRef.current = false;
    closeFlyout();
  }, [closeFlyout]);

  const handleFlyoutMouseEnter = useCallback(() => {
    clearCloseTimeout();
    isInFlyoutRef.current = true;
  }, [clearCloseTimeout]);

  const handleFlyoutMouseLeave = useCallback(() => {
    isInFlyoutRef.current = false;
    closeFlyout();
  }, [closeFlyout]);

  return (
    <div ref={panelRef} className="relative">
      <aside className="w-[280px] bg-white border-r border-slate-200/60 flex flex-col h-full overflow-hidden">
        {/* Search bar */}
        <div className="p-3 border-b border-slate-200/60 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search actions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md border border-slate-200 bg-slate-50 focus:bg-white focus:border-slate-300 focus:outline-none transition-colors placeholder:text-slate-400"
            />
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {isSearching ? (
            <div className="p-2 space-y-1">
              {searchResults.length > 0 ? (
                searchResults.map((node) => <DraggableNode key={node.id} node={node} />)
              ) : (
                <p className="text-xs text-slate-400 text-center py-6">No matching actions</p>
              )}
            </div>
          ) : (
            <div className="p-2 space-y-0.5">
              {categoryListItems.map((item) => {
                if (item.kind === 'section-header') {
                  return (
                    <div key={item.id} className="px-3 pt-4 pb-1">
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                        {item.label}
                      </span>
                    </div>
                  );
                }

                const Icon = item.icon;
                const isActive = activeId === item.id;
                const isApp = item.kind === 'app';

                return (
                  <button
                    key={item.id}
                    onMouseEnter={(e) => handleRowMouseEnter(item.id, e)}
                    onMouseLeave={handleRowMouseLeave}
                    onClick={(e) => {
                      const panelRect = panelRef.current?.getBoundingClientRect();
                      const rowRect = e.currentTarget.getBoundingClientRect();
                      if (panelRect) {
                        setFlyoutTop(rowRect.top); setFlyoutLeft(panelRect.right);
                      }
                      setActiveId(item.id);
                    }}
                    className={
                      'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ' +
                      (isActive
                        ? 'bg-slate-100 text-slate-900 font-medium'
                        : 'text-slate-600 hover:bg-gray-100')
                    }
                  >
                    {Icon && (
                      <div
                        className={
                          'size-6 rounded-md flex items-center justify-center flex-shrink-0 ' +
                          (isApp
                            ? 'bg-gray-50'
                            : isActive
                              ? 'bg-slate-200'
                              : 'bg-slate-100')
                        }
                      >
                        {isApp && APP_LOGOS[item.label] ? (
                          <img src={APP_LOGOS[item.label]} alt={item.label} className="size-4 rounded" />
                        ) : (
                        <Icon
                          className={
                            'size-3.5 ' +
                            (isApp
                              ? 'text-emerald-600'
                              : isActive
                                ? 'text-slate-700'
                                : 'text-slate-500')
                          }
                        />
                        )}
                      </div>
                    )}
                    <span className="truncate flex-1 text-left">{item.label}</span>
                    <ChevronRight
                      className={
                        'size-3.5 flex-shrink-0 ' +
                        (isActive ? 'text-slate-500' : 'text-slate-300')
                      }
                    />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Manage apps link */}
        <div className="p-2 border-t border-slate-200/60 flex-shrink-0">
          <a
            href="/workflows/settings"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-violet-600 hover:text-violet-700 hover:bg-violet-50 transition-all"
          >
            <Link2 className="size-4 flex-shrink-0" />
            <span>Manage apps</span>
          </a>
        </div>
      </aside>

      {/* Flyout submenu */}
      {!isSearching && activeId && activeNodes.length > 0 && (
        <FlyoutPanel
          nodes={activeNodes}
          topOffset={flyoutTop} leftOffset={flyoutLeft}
          onMouseEnter={handleFlyoutMouseEnter}
          onMouseLeave={handleFlyoutMouseLeave}
        />
      )}
    </div>
  );
}
