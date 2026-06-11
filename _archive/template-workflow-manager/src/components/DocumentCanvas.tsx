'use client';

import { FXDATemplate, FXDAField } from '@/types/fxda';
import { useState } from 'react';

interface DocumentCanvasProps {
  fxdaDocument: FXDATemplate;
  selectedWorkflowId?: string;
}

export default function DocumentCanvas({ fxdaDocument, selectedWorkflowId }: DocumentCanvasProps) {
  const [selectedField, setSelectedField] = useState<string | null>(null);

  if (!fxdaDocument.pages || fxdaDocument.pages.length === 0) {
    return <div className="text-center text-gray-500 py-12">No document to display</div>;
  }

  const page = fxdaDocument.pages[0];
  const scale = 0.75; // Scale down for display

  const getFieldColor = (field: FXDAField) => {
    if (field.party === 1) return 'bg-blue-100 border-blue-400';
    if (field.party === 2) return 'bg-green-100 border-green-400';
    if (field.party === 3) return 'bg-purple-100 border-purple-400';
    return 'bg-gray-100 border-gray-400';
  };

  const getFieldIcon = (type: string) => {
    switch (type) {
      case 'signature': return '✍️';
      case 'date': return '📅';
      case 'text': return '📝';
      case 'checkbox': return '☑️';
      default: return '📄';
    }
  };

  return (
    <div className="space-y-4">
      {/* Document Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <div className="text-2xl">📄</div>
          <div className="flex-1">
            <h3 className="font-semibold text-blue-900">{fxdaDocument.documentName}</h3>
            <p className="text-sm text-blue-700 mt-1">{fxdaDocument.description}</p>
            <div className="flex gap-2 mt-2 text-xs text-blue-600">
              <span>Version: {fxdaDocument.version}</span>
              <span>•</span>
              <span>Fields: {fxdaDocument.fields.length}</span>
              <span>•</span>
              <span>Category: {fxdaDocument.category}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Canvas Container */}
      <div className="bg-white rounded-lg shadow-lg border-2 border-gray-200 overflow-hidden">
        <div className="bg-gray-100 border-b px-4 py-2 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">Document Preview (Page 1)</span>
          <div className="flex gap-2 text-xs text-gray-600">
            <span>Width: {page.width}px</span>
            <span>Height: {page.height}px</span>
          </div>
        </div>

        {/* Document Canvas */}
        <div className="p-6 bg-gray-50 overflow-auto">
          <div
            className="bg-white shadow-xl mx-auto relative"
            style={{
              width: `${page.width * scale}px`,
              height: `${page.height * scale}px`,
            }}
          >
            {/* Document Content */}
            <div className="absolute inset-0 p-8 text-xs leading-relaxed whitespace-pre-wrap font-mono text-gray-700 overflow-hidden">
              {page.content}
            </div>

            {/* Form Fields Overlay */}
            {fxdaDocument.fields.map((field) => (
              <div
                key={field.id}
                onClick={() => setSelectedField(field.id)}
                className={`absolute border-2 rounded cursor-pointer transition-all ${
                  getFieldColor(field)
                } ${
                  selectedField === field.id
                    ? 'ring-2 ring-offset-2 ring-blue-500 z-10'
                    : 'hover:ring-2 hover:ring-blue-300'
                } ${field.type === 'signature' ? 'border-dashed' : ''}`}
                style={{
                  left: `${field.x * scale}px`,
                  top: `${field.y * scale}px`,
                  width: `${field.width * scale}px`,
                  height: `${field.height * scale}px`,
                }}
                title={field.name}
              >
                <div className="absolute inset-0 flex items-center justify-center text-xs font-medium opacity-70">
                  <span className="mr-1">{getFieldIcon(field.type)}</span>
                  {field.type === 'signature' && <span>Sign here</span>}
                  {field.type === 'date' && <span>Date</span>}
                  {field.type === 'checkbox' && <span className="text-[10px]">☐</span>}
                  {field.type === 'text' && <span className="truncate px-1">{field.placeholder || field.name}</span>}
                </div>
                {field.required && (
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full text-white text-[8px] flex items-center justify-center">
                    *
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Field Legend */}
      <div className="bg-white rounded-lg border p-4">
        <h4 className="font-semibold text-sm mb-3">Form Fields ({fxdaDocument.fields.length})</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
          {fxdaDocument.fields.map((field) => (
            <div
              key={field.id}
              onClick={() => setSelectedField(field.id)}
              className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition-colors ${
                selectedField === field.id ? 'bg-blue-50 border-blue-400' : 'border-gray-200 hover:bg-gray-50'
              }`}
            >
              <span>{getFieldIcon(field.type)}</span>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{field.name}</div>
                <div className="text-xs text-gray-500">
                  {field.type} {field.party && `• Party ${field.party}`} {field.required && '• Required'}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
