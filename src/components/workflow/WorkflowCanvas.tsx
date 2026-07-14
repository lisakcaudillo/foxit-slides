'use client';

import { useState, useCallback, useRef, useMemo } from 'react';
import { Plus, Zap, Cog, GitBranch, Link2 } from 'lucide-react';
import { WorkflowNode } from './WorkflowNode';
import type { WorkflowNodeData } from './WorkflowNode';

interface Connection {
  from: string;
  to: string;
}

interface InsertBetweenPayload {
  connectionIndex: number;
  category: string;
  midX: number;
  midY: number;
}

interface DraggingConnection {
  fromNodeId: string;
  startX: number;
  startY: number;
  mouseX: number;
  mouseY: number;
}

interface SelectionRect {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

interface WorkflowCanvasProps {
  nodes: WorkflowNodeData[];
  connections: Connection[];
  selectedNodeIds: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  onAddNode?: (node: WorkflowNodeData) => void;
  onRemoveNode?: (nodeId: string) => void;
  onMoveNode?: (nodeId: string, x: number, y: number) => void;
  onAddConnection?: (from: string, to: string) => void;
  onConfigure?: (nodeId: string) => void;
  onInsertBetween?: (payload: InsertBetweenPayload) => void;
  onDuplicateNode?: (nodeId: string) => void;
  onCopyNode?: (nodeId: string) => void;
  onPasteNodes?: () => void;
  onInsertBefore?: (nodeId: string) => void;
  onInsertAfter?: (nodeId: string) => void;
  onRenameNode?: (nodeId: string, newLabel: string) => void;
  minimapVisible?: boolean;
  emptyStateContent?: React.ReactNode;
}

export { type InsertBetweenPayload };

export function WorkflowCanvas({ nodes, connections, selectedNodeIds, onSelectionChange, onAddNode, onRemoveNode, onMoveNode, onAddConnection, onConfigure, onInsertBetween, onDuplicateNode, onCopyNode, onPasteNodes, onInsertBefore, onInsertAfter, onRenameNode, minimapVisible = true, emptyStateContent }: WorkflowCanvasProps) {
  const [isOver, setIsOver] = useState(false);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [insertPopoverIdx, setInsertPopoverIdx] = useState<number | null>(null);
  const [draggingConnection, setDraggingConnection] = useState<DraggingConnection | null>(null);
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);
  const isSelecting = useRef(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsOver(false);
    const raw = e.dataTransfer.getData('application/json');
    if (!raw || !onAddNode) return;

    const data = JSON.parse(raw) as Record<string, unknown>;

    // Ignore internal canvas node drags (reordering) — only handle library drops
    if ('canvasNodeId' in data) return;

    const nodeType = data.nodeType as {
      id: string;
      label: string;
      category: string;
      isMCP?: boolean;
      mcpServerName?: string;
      mcpToolName?: string;
    } | undefined;
    if (!nodeType) return;

    const canvasRect = e.currentTarget.getBoundingClientRect();
    const rawX = e.clientX - canvasRect.left;
    const rawY = e.clientY - canvasRect.top;

    // Snap to grid: align to nearest row if within threshold
    const GRID = 100;
    const SNAP_THRESHOLD = 40;
    const snapToGrid = (val: number) => {
      const nearest = Math.round(val / GRID) * GRID;
      return Math.abs(val - nearest) < SNAP_THRESHOLD ? nearest : val;
    };
    const x = snapToGrid(rawX);
    const y = snapToGrid(rawY);

    const newNode: WorkflowNodeData = {
      id: `node-${Date.now()}`,
      type: nodeType.id,
      label: nodeType.label,
      x,
      y,
      category: nodeType.category,
      ...(nodeType.isMCP ? {
        isMCP: true,
        mcpServerName: nodeType.mcpServerName,
        mcpToolName: nodeType.mcpToolName,
      } : {}),
    };

    onAddNode(newNode);
  }, [onAddNode]);

  // Connection mode handlers
  const handleConnectionStart = useCallback((nodeId: string) => {
    setConnectingFrom(nodeId);
  }, []);

  const handleConnectionEnd = useCallback((nodeId: string) => {
    if (connectingFrom && connectingFrom !== nodeId) {
      onAddConnection?.(connectingFrom, nodeId);
    }
    setConnectingFrom(null);
    setCursorPos(null);
  }, [connectingFrom, onAddConnection]);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (connectingFrom && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      setCursorPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
    if (draggingConnection && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      setDraggingConnection((prev) => prev ? { ...prev, mouseX: e.clientX - rect.left, mouseY: e.clientY - rect.top } : null);
    }
    // Rubber-band selection drag
    if (isSelecting.current && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      setSelectionRect((prev) => prev ? { ...prev, currentX: e.clientX - rect.left, currentY: e.clientY - rect.top } : null);
    }
  }, [connectingFrom, draggingConnection]);

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).closest('[data-canvas-bg]')) return;
    if (connectingFrom || draggingConnection) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    isSelecting.current = true;
    setSelectionRect({ startX: mx, startY: my, currentX: mx, currentY: my });
  }, [connectingFrom, draggingConnection]);

  const handleCanvasMouseUp = useCallback(() => {
    // Finalize rubber-band selection
    if (isSelecting.current && selectionRect) {
      const NODE_WIDTH = 200;
      const NODE_HEIGHT = 80;
      const x1 = Math.min(selectionRect.startX, selectionRect.currentX);
      const y1 = Math.min(selectionRect.startY, selectionRect.currentY);
      const x2 = Math.max(selectionRect.startX, selectionRect.currentX);
      const y2 = Math.max(selectionRect.startY, selectionRect.currentY);
      if (Math.abs(x2 - x1) > 5 || Math.abs(y2 - y1) > 5) {
        const selected = new Set<string>();
        for (const node of nodes) {
          if (node.x < x2 && node.x + NODE_WIDTH > x1 && node.y < y2 && node.y + NODE_HEIGHT > y1) {
            selected.add(node.id);
          }
        }
        onSelectionChange?.(selected);
      }
      isSelecting.current = false;
      setSelectionRect(null);
    }
    if (draggingConnection) {
      setDraggingConnection(null);
    }
  }, [draggingConnection, selectionRect, nodes, onSelectionChange]);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (connectingFrom && e.target === e.currentTarget) {
      setConnectingFrom(null);
      setCursorPos(null);
    }
    setInsertPopoverIdx(null);
    // Clear selection on empty canvas click
    if (!isSelecting.current && e.target === e.currentTarget) {
      onSelectionChange?.(new Set());
    }
  }, [connectingFrom, onSelectionChange]);

  // Drag-connection handlers passed to WorkflowNode
  const handleDragConnectionStart = useCallback((nodeId: string, startX: number, startY: number) => {
    setDraggingConnection({ fromNodeId: nodeId, startX, startY, mouseX: startX, mouseY: startY });
  }, []);

  const handleDragConnectionEnd = useCallback((nodeId: string) => {
    if (draggingConnection && draggingConnection.fromNodeId !== nodeId) {
      onAddConnection?.(draggingConnection.fromNodeId, nodeId);
    }
    setDraggingConnection(null);
  }, [draggingConnection, onAddConnection]);

  // Calculate connection paths
  const getConnectionPath = (from: WorkflowNodeData, to: WorkflowNodeData) => {
    const startX = from.x + 200; // Right edge of node (200px width)
    const startY = from.y + 40; // Vertical center approx
    const endX = to.x; // Left edge of node
    const endY = to.y + 40;

    const midX = (startX + endX) / 2;

    return `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`;
  };

  // Temporary connection line from source node to cursor
  const getTempConnectionPath = (from: WorkflowNodeData, toX: number, toY: number) => {
    const startX = from.x + 200;
    const startY = from.y + 40;
    const midX = (startX + toX) / 2;

    return `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${toY}, ${toX} ${toY}`;
  };

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const connectingFromNode = connectingFrom ? nodeMap.get(connectingFrom) : undefined;

  // Minimap calculations
  const minimapSize = { width: 160, height: 100 } as const;
  const hasEnoughNodes = nodes.length >= 4;

  const minimapBounds = useMemo(() => {
    if (nodes.length === 0) return { minX: 0, minY: 0, maxX: 1000, maxY: 600 };
    const NODE_WIDTH = 200;
    const NODE_HEIGHT = 80;
    const padding = 40;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of nodes) {
      if (n.x < minX) minX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.x + NODE_WIDTH > maxX) maxX = n.x + NODE_WIDTH;
      if (n.y + NODE_HEIGHT > maxY) maxY = n.y + NODE_HEIGHT;
    }
    return {
      minX: minX - padding,
      minY: minY - padding,
      maxX: maxX + padding,
      maxY: maxY + padding,
    };
  }, [nodes]);

  const getCategoryColor = (category: string): string => {
    switch (category) {
      case 'triggers': return '#3b82f6';
      case 'pdf': return '#8b5cf6';
      case 'condition': return '#f59e0b';
      case 'integrations': return '#f43f5e';
      default: return '#6b7280';
    }
  };

  const handleMinimapClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!canvasRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const boundsWidth = minimapBounds.maxX - minimapBounds.minX;
    const boundsHeight = minimapBounds.maxY - minimapBounds.minY;

    // Map minimap click position to canvas coordinates
    const canvasX = minimapBounds.minX + (clickX / minimapSize.width) * boundsWidth;
    const canvasY = minimapBounds.minY + (clickY / minimapSize.height) * boundsHeight;

    // Scroll the canvas parent to center on the clicked point
    const canvasEl = canvasRef.current;
    const parentEl = canvasEl.parentElement;
    if (parentEl) {
      parentEl.scrollTo({
        left: canvasX - parentEl.clientWidth / 2,
        top: canvasY - parentEl.clientHeight / 2,
        behavior: 'smooth',
      });
    }
  }, [minimapBounds, minimapSize.width, minimapSize.height]);

  return (
    <div
      ref={canvasRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onMouseDown={handleCanvasMouseDown}
      onMouseMove={handleCanvasMouseMove}
      onMouseUp={handleCanvasMouseUp}
      onClick={handleCanvasClick}
      className={'flex-1 relative overflow-auto bg-gray-50/50' + (connectingFrom || draggingConnection ? ' cursor-crosshair' : '')}
    >
      {/* Grid background */}
      <div
        data-canvas-bg
        className="absolute inset-0"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgb(229 231 235 / 0.3) 1px, transparent 1px),
            linear-gradient(to bottom, rgb(229 231 235 / 0.3) 1px, transparent 1px)
          `,
          backgroundSize: '20px 20px',
        }}
      />

      {/* Canvas content — sized to fit all nodes with padding */}
      <div className="relative" style={{
        minWidth: '100%',
        minHeight: '100%',
        width: nodes.length > 0 ? Math.max(...nodes.map((n) => n.x + 400)) : '100%',
        height: nodes.length > 0 ? Math.max(...nodes.map((n) => n.y + 200)) : '100%',
      }}>
        {/* SVG for connections */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
          <defs>
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="10"
              refX="9"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 10 3, 0 6" fill="#94a3b8" />
            </marker>
            <marker
              id="arrowhead-temp"
              markerWidth="10"
              markerHeight="10"
              refX="9"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 10 3, 0 6" fill="#3b82f6" />
            </marker>
          </defs>
          {connections.map((conn, idx) => {
            const fromNode = nodeMap.get(conn.from);
            const toNode = nodeMap.get(conn.to);
            if (!fromNode || !toNode) return null;

            const startX = fromNode.x + 200;
            const startY = fromNode.y + 40;
            const endX = toNode.x;
            const endY = toNode.y + 40;
            const midX = (startX + endX) / 2;
            const midY = (startY + endY) / 2;

            return (
              <g key={idx} className="group/conn pointer-events-auto">
                {/* Wider invisible hit area */}
                <path
                  d={getConnectionPath(fromNode, toNode)}
                  stroke="transparent"
                  strokeWidth="16"
                  fill="none"
                />
                {/* Visible path */}
                <path
                  d={getConnectionPath(fromNode, toNode)}
                  stroke="#94a3b8"
                  strokeWidth="2"
                  fill="none"
                  markerEnd="url(#arrowhead)"
                  className="pointer-events-none"
                />
                {/* Midpoint "+" button */}
                <g
                  className="opacity-0 group-hover/conn:opacity-100 transition-opacity cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    setInsertPopoverIdx(insertPopoverIdx === idx ? null : idx);
                  }}
                >
                  <circle cx={midX} cy={midY} r="12" fill="white" stroke="#d1d5db" strokeWidth="1" />
                  <line x1={midX - 4} y1={midY} x2={midX + 4} y2={midY} stroke="#6b7280" strokeWidth="2" strokeLinecap="round" />
                  <line x1={midX} y1={midY - 4} x2={midX} y2={midY + 4} stroke="#6b7280" strokeWidth="2" strokeLinecap="round" />
                </g>
              </g>
            );
          })}
          {/* Temporary connection line while click-click connecting */}
          {connectingFromNode && cursorPos && (
            <path
              d={getTempConnectionPath(connectingFromNode, cursorPos.x, cursorPos.y)}
              stroke="#3b82f6"
              strokeWidth="2"
              strokeDasharray="6 3"
              fill="none"
              markerEnd="url(#arrowhead-temp)"
              className="pointer-events-none"
            />
          )}
          {/* Temporary connection line while drag connecting */}
          {draggingConnection && (() => {
            const fromNode = nodeMap.get(draggingConnection.fromNodeId);
            if (!fromNode) return null;
            const path = getTempConnectionPath(fromNode, draggingConnection.mouseX, draggingConnection.mouseY);
            return (
              <path
                d={path}
                stroke="#3b82f6"
                strokeWidth="2"
                strokeDasharray="6 3"
                fill="none"
                markerEnd="url(#arrowhead-temp)"
                className="pointer-events-none"
              />
            );
          })()}
        </svg>

        {/* Insert-between popover (rendered outside SVG for proper HTML rendering) */}
        {insertPopoverIdx !== null && (() => {
          const conn = connections[insertPopoverIdx];
          if (!conn) return null;
          const fromNode = nodeMap.get(conn.from);
          const toNode = nodeMap.get(conn.to);
          if (!fromNode || !toNode) return null;
          const startX = fromNode.x + 200;
          const startY = fromNode.y + 40;
          const endX = toNode.x;
          const endY = toNode.y + 40;
          const midX = (startX + endX) / 2;
          const midY = (startY + endY) / 2;

          const categories = [
            { id: 'triggers', label: 'Trigger', icon: Zap, color: 'text-blue-600 hover:bg-blue-50' },
            { id: 'pdf', label: 'Action', icon: Cog, color: 'text-violet-600 hover:bg-violet-50' },
            { id: 'condition', label: 'Condition', icon: GitBranch, color: 'text-amber-600 hover:bg-amber-50' },
            { id: 'integrations', label: 'Integration', icon: Link2, color: 'text-rose-600 hover:bg-rose-50' },
          ];

          return (
            <div
              className="absolute bg-white rounded-xl shadow-lg border border-gray-200 p-2 flex gap-1"
              style={{ left: midX - 100, top: midY + 20, zIndex: 10 }}
            >
              {categories.map((cat) => {
                const CatIcon = cat.icon;
                return (
                  <button
                    key={cat.id}
                    title={cat.label}
                    onClick={(e) => {
                      e.stopPropagation();
                      onInsertBetween?.({
                        connectionIndex: insertPopoverIdx,
                        category: cat.id,
                        midX,
                        midY,
                      });
                      setInsertPopoverIdx(null);
                    }}
                    className={'flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-colors ' + cat.color}
                  >
                    <CatIcon className="size-4" />
                    <span className="text-[10px] font-medium">{cat.label}</span>
                  </button>
                );
              })}
            </div>
          );
        })()}

        {/* Nodes */}
        <div className="absolute inset-0" style={{ zIndex: 2 }}>
          {nodes.map((node) => (
            <WorkflowNode
              key={node.id}
              node={node}
              isSelected={selectedNodeIds.has(node.id)}
              onSelect={(nodeId, additive) => {
                if (additive) {
                  const next = new Set(selectedNodeIds);
                  if (next.has(nodeId)) next.delete(nodeId); else next.add(nodeId);
                  onSelectionChange?.(next);
                } else {
                  onSelectionChange?.(new Set([nodeId]));
                }
              }}
              onRemove={onRemoveNode ? () => onRemoveNode(node.id) : undefined}
              onCopy={onCopyNode ? () => onCopyNode(node.id) : undefined}
              onPaste={onPasteNodes}
              onMoveNode={onMoveNode}
              onConnectionStart={handleConnectionStart}
              onConnectionEnd={handleConnectionEnd}
              onConfigure={onConfigure}
              isConnecting={(connectingFrom !== null && connectingFrom !== node.id) || (draggingConnection !== null && draggingConnection.fromNodeId !== node.id)}
              onDuplicate={onDuplicateNode ? () => onDuplicateNode(node.id) : undefined}
              onInsertBefore={onInsertBefore ? () => onInsertBefore(node.id) : undefined}
              onInsertAfter={onInsertAfter ? () => onInsertAfter(node.id) : undefined}
              onRename={onRenameNode ? (newLabel: string) => onRenameNode(node.id, newLabel) : undefined}
              onDragConnectionStart={handleDragConnectionStart}
              onDragConnectionEnd={handleDragConnectionEnd}
            />
          ))}
        </div>

        {/* Rubber-band selection rectangle */}
        {selectionRect && (
          <div
            className="absolute border-2 border-violet-500 bg-violet-500/10 pointer-events-none"
            style={{
              left: Math.min(selectionRect.startX, selectionRect.currentX),
              top: Math.min(selectionRect.startY, selectionRect.currentY),
              width: Math.abs(selectionRect.currentX - selectionRect.startX),
              height: Math.abs(selectionRect.currentY - selectionRect.startY),
              zIndex: 10,
            }}
          />
        )}

        {/* Drop indicator */}
        {isOver && (
          <div
            className="absolute inset-0 bg-blue-500/5 border-2 border-dashed border-blue-400 pointer-events-none"
            style={{ zIndex: 3 }}
          />
        )}

        {/* Connecting mode indicator */}
        {(connectingFrom || draggingConnection) && (
          <div
            className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-blue-600 text-white text-sm rounded-full shadow-lg pointer-events-none"
            style={{ zIndex: 4 }}
          >
            {draggingConnection ? 'Drop on a target input port to connect' : 'Click a target action to connect, or click canvas to cancel'}
          </div>
        )}

        {/* Empty state */}
        {nodes.length === 0 && !isOver && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 5 }}>
            {emptyStateContent ?? (
              <div className="text-center pointer-events-none">
                <div className="size-16 rounded-2xl bg-gray-100 mx-auto mb-4 flex items-center justify-center">
                  <svg
                    className="size-8 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                </div>
                <h3 className="font-medium text-gray-900 mb-1">Drop a step here to start building your workflow</h3>
                <p className="text-sm text-gray-500">Drag a step from the library on the left, or use AI to generate a flow.</p>
              </div>
            )}
          </div>
        )}

        {/* Canvas Minimap — only visible with 4+ nodes */}
        {hasEnoughNodes && minimapVisible && (
          <div
            className="absolute bottom-4 right-4 bg-white/90 border border-gray-200 rounded-lg shadow-sm cursor-pointer overflow-hidden"
            style={{ width: minimapSize.width, height: minimapSize.height, zIndex: 5 }}
            onClick={handleMinimapClick}
            title="Click to navigate"
          >
            <svg
              width={minimapSize.width}
              height={minimapSize.height}
              viewBox={`0 0 ${minimapSize.width} ${minimapSize.height}`}
            >
              {/* Connections as thin lines */}
              {connections.map((conn, idx) => {
                const fromNode = nodeMap.get(conn.from);
                const toNode = nodeMap.get(conn.to);
                if (!fromNode || !toNode) return null;

                const boundsWidth = minimapBounds.maxX - minimapBounds.minX;
                const boundsHeight = minimapBounds.maxY - minimapBounds.minY;
                const scaleX = minimapSize.width / boundsWidth;
                const scaleY = minimapSize.height / boundsHeight;

                const x1 = (fromNode.x + 100 - minimapBounds.minX) * scaleX;
                const y1 = (fromNode.y + 40 - minimapBounds.minY) * scaleY;
                const x2 = (toNode.x + 100 - minimapBounds.minX) * scaleX;
                const y2 = (toNode.y + 40 - minimapBounds.minY) * scaleY;

                return (
                  <line
                    key={`minimap-conn-${idx}`}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="#cbd5e1"
                    strokeWidth={1}
                  />
                );
              })}
              {/* Nodes as small colored rectangles */}
              {nodes.map((node) => {
                const boundsWidth = minimapBounds.maxX - minimapBounds.minX;
                const boundsHeight = minimapBounds.maxY - minimapBounds.minY;
                const scaleX = minimapSize.width / boundsWidth;
                const scaleY = minimapSize.height / boundsHeight;

                const rectWidth = Math.max(200 * scaleX, 6);
                const rectHeight = Math.max(40 * scaleY, 4);
                const x = (node.x - minimapBounds.minX) * scaleX;
                const y = (node.y - minimapBounds.minY) * scaleY;

                return (
                  <rect
                    key={`minimap-node-${node.id}`}
                    x={x}
                    y={y}
                    width={rectWidth}
                    height={rectHeight}
                    rx={2}
                    fill={getCategoryColor(node.category)}
                    opacity={0.8}
                  />
                );
              })}
              {/* Viewport rectangle showing current visible area */}
              {canvasRef.current && (() => {
                const el = canvasRef.current;
                const parentEl = el.parentElement;
                if (!parentEl) return null;

                const boundsWidth = minimapBounds.maxX - minimapBounds.minX;
                const boundsHeight = minimapBounds.maxY - minimapBounds.minY;
                const scaleX = minimapSize.width / boundsWidth;
                const scaleY = minimapSize.height / boundsHeight;

                const vpX = (parentEl.scrollLeft - minimapBounds.minX) * scaleX;
                const vpY = (parentEl.scrollTop - minimapBounds.minY) * scaleY;
                const vpW = parentEl.clientWidth * scaleX;
                const vpH = parentEl.clientHeight * scaleY;

                return (
                  <rect
                    x={Math.max(0, vpX)}
                    y={Math.max(0, vpY)}
                    width={Math.min(vpW, minimapSize.width)}
                    height={Math.min(vpH, minimapSize.height)}
                    fill="rgba(139, 92, 246, 0.08)"
                    stroke="#8b5cf6"
                    strokeWidth={1.5}
                    rx={2}
                  />
                );
              })()}
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}
