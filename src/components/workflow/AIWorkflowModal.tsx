'use client';

import { X, Sparkles, Info } from 'lucide-react';

interface AIWorkflowModalProps {
  onClose: () => void;
}

export function AIWorkflowModal({ onClose }: AIWorkflowModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center">
              <Sparkles className="size-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Generate Workflow with AI</h2>
              <p className="text-sm text-gray-500">Describe what you want to automate</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="size-9 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-colors"
            aria-label="Close"
          >
            <X className="size-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <div className="size-14 rounded-full bg-violet-50 flex items-center justify-center mb-4">
              <Info className="size-7 text-violet-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Coming soon</h3>
            <p className="text-sm text-gray-500 max-w-md leading-relaxed">
              AI workflow generation is under active development. For now, use the
              suggestion cards on the canvas to start from a template, or drag nodes
              from the library to build your workflow manually.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 flex items-center justify-end">
          <button
            onClick={onClose}
            className="h-10 px-5 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
