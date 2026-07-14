'use client';

import { Check, X, ArrowRight, Plus, Trash2, Move, Info } from 'lucide-react';
import type { BlockUpdateWithStatus } from '@/types/block-update';

interface BlockUpdatePreviewProps {
  updates: BlockUpdateWithStatus[];
  onAccept: (updateId: string) => void;
  onReject: (updateId: string) => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
}

const OP_STYLE: Record<string, { icon: typeof Plus; label: string; color: string; bg: string }> = {
  insert: { icon: Plus, label: 'Insert', color: 'text-green-700', bg: 'bg-green-50 border-green-200' },
  replace: { icon: ArrowRight, label: 'Replace', color: 'text-violet-700', bg: 'bg-violet-50 border-violet-200' },
  delete: { icon: Trash2, label: 'Delete', color: 'text-red-700', bg: 'bg-red-50 border-red-200' },
  move: { icon: Move, label: 'Move', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
};

export default function BlockUpdatePreview({
  updates,
  onAccept,
  onReject,
  onAcceptAll,
  onRejectAll,
}: BlockUpdatePreviewProps) {
  const pending = updates.filter((u) => u.status === 'pending' || u.status === 'previewing');

  if (updates.length === 0) return null;

  return (
    <div className="space-y-3">
      {/* Batch actions */}
      {pending.length > 1 && (
        <div className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-lg border border-slate-200">
          <span className="text-xs font-medium text-slate-600">
            {pending.length} changes proposed
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onAcceptAll}
              className="px-2.5 py-1 text-xs font-medium text-green-700 bg-green-50 rounded-md hover:bg-green-100 transition-colors"
            >
              Accept all
            </button>
            <button
              onClick={onRejectAll}
              className="px-2.5 py-1 text-xs font-medium text-red-700 bg-red-50 rounded-md hover:bg-red-100 transition-colors"
            >
              Reject all
            </button>
          </div>
        </div>
      )}

      {/* Individual updates */}
      {updates.map((update) => {
        const style = OP_STYLE[update.operation] ?? OP_STYLE.replace;
        const Icon = style.icon;
        const isResolved = update.status === 'applied' || update.status === 'rejected';

        return (
          <div
            key={update.id}
            className={`rounded-lg border p-3 transition-opacity ${style.bg} ${isResolved ? 'opacity-50' : ''}`}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Icon className={`size-3.5 ${style.color}`} />
                <span className={`text-xs font-semibold ${style.color}`}>{style.label}</span>
                {update.targetBlockId && (
                  <span className="text-xs text-slate-500 font-mono">{update.targetBlockId.slice(0, 8)}</span>
                )}
              </div>
              {!isResolved && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onAccept(update.id)}
                    className="size-6 rounded-md bg-green-100 hover:bg-green-200 flex items-center justify-center transition-colors"
                    title="Accept change"
                  >
                    <Check className="size-3.5 text-green-700" />
                  </button>
                  <button
                    onClick={() => onReject(update.id)}
                    className="size-6 rounded-md bg-red-100 hover:bg-red-200 flex items-center justify-center transition-colors"
                    title="Reject change"
                  >
                    <X className="size-3.5 text-red-700" />
                  </button>
                </div>
              )}
              {update.status === 'applied' && (
                <span className="text-xs text-green-600 font-medium">Applied</span>
              )}
              {update.status === 'rejected' && (
                <span className="text-xs text-red-600 font-medium">Rejected</span>
              )}
            </div>

            {/* Diff view for replace */}
            {update.operation === 'replace' && update.originalContent && (
              <div className="space-y-1.5 mb-2">
                <div className="text-xs bg-red-100/60 text-red-800 rounded px-2 py-1.5 line-through">
                  {update.originalContent.slice(0, 200)}{update.originalContent.length > 200 ? '...' : ''}
                </div>
                <div className="text-xs bg-green-100/60 text-green-800 rounded px-2 py-1.5">
                  {update.content?.slice(0, 200)}{(update.content?.length ?? 0) > 200 ? '...' : ''}
                </div>
              </div>
            )}

            {/* Content for insert */}
            {update.operation === 'insert' && update.content && (
              <div className="text-xs bg-green-100/60 text-green-800 rounded px-2 py-1.5 mb-2">
                {update.content.slice(0, 200)}{update.content.length > 200 ? '...' : ''}
              </div>
            )}

            {/* Content for delete */}
            {update.operation === 'delete' && update.originalContent && (
              <div className="text-xs bg-red-100/60 text-red-800 rounded px-2 py-1.5 line-through mb-2">
                {update.originalContent.slice(0, 200)}{update.originalContent.length > 200 ? '...' : ''}
              </div>
            )}

            {/* Rationale */}
            {update.rationale && (
              <div className="flex items-start gap-1.5 text-xs text-slate-600">
                <Info className="size-3 mt-0.5 flex-shrink-0" />
                <span>{update.rationale}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
