'use client';

import { useState, useEffect } from 'react';
import { X, Move, Type, Palette, Maximize2, Eye, Code } from 'lucide-react';

interface InspectorPanelProps {
  selectedElement: HTMLElement | null;
  onClose: () => void;
  onUpdate: (updates: any) => void;
}

export default function InspectorPanel({ selectedElement, onClose, onUpdate }: InspectorPanelProps) {
  const [elementData, setElementData] = useState<any>(null);
  const [contentKey, setContentKey] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedElement) return;

    const computedStyle = window.getComputedStyle(selectedElement);
    const rect = selectedElement.getBoundingClientRect();

    // Check if this element has a content key (is an EditableText component)
    const editableKey = selectedElement.getAttribute('data-editable-key');
    const editableValue = selectedElement.getAttribute('data-editable-value');
    setContentKey(editableKey);

    // Get only direct text content (not from child elements)
    let directText = '';
    selectedElement.childNodes.forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        directText += node.textContent || '';
      }
    });

    // If it's an editable element, use the stored value
    const textContent = editableValue || directText.trim();

    setElementData({
      tagName: selectedElement.tagName.toLowerCase(),
      text: textContent,
      hasDirectText: textContent.length > 0,
      isEditableText: !!editableKey,
      contentKey: editableKey,
      id: selectedElement.id,
      classes: Array.from(selectedElement.classList),
      styles: {
        color: computedStyle.color,
        backgroundColor: computedStyle.backgroundColor,
        fontSize: computedStyle.fontSize,
        fontWeight: computedStyle.fontWeight,
        padding: computedStyle.padding,
        margin: computedStyle.margin,
        width: rect.width,
        height: rect.height,
        display: computedStyle.display,
        position: computedStyle.position,
      },
      position: {
        top: rect.top,
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
      }
    });
  }, [selectedElement]);

  if (!selectedElement || !elementData) return null;

  const updateText = (newText: string) => {
    // Find and update text nodes
    let textNodeFound = false;
    
    selectedElement.childNodes.forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        node.textContent = newText;
        textNodeFound = true;
      }
    });
    
    // If no text node exists, create one
    if (!textNodeFound && newText) {
      const textNode = document.createTextNode(newText);
      if (selectedElement.childNodes.length > 0) {
        selectedElement.insertBefore(textNode, selectedElement.firstChild);
      } else {
        selectedElement.appendChild(textNode);
      }
    }
    
    // Update data attribute if it's an EditableText component
    if (contentKey) {
      selectedElement.setAttribute('data-editable-value', newText);
    }
    
    // Update local state
    setElementData((prev: any) => prev ? { ...prev, text: newText } : null);
    onUpdate({ 
      type: 'text', 
      contentKey: contentKey || null,
      value: newText 
    });
  };

  const updateStyle = (property: string, value: string) => {
    (selectedElement.style as any)[property] = value;
    onUpdate({ style: { [property]: value } });
  };

  return (
    <div className="fixed right-4 top-20 w-80 bg-white rounded-lg shadow-2xl border-2 border-blue-500 z-50 max-h-[80vh] overflow-y-auto">
      {/* Header */}
      <div className="bg-blue-600 text-white p-4 flex items-center justify-between sticky top-0">
        <div className="flex items-center gap-2">
          <Code className="h-5 w-5" />
          <span className="font-semibold">Element Inspector</span>
        </div>
        <button onClick={onClose} className="hover:bg-blue-700 p-1 rounded">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Element Info */}
      <div className="p-4 border-b bg-gray-50">
        <div className="text-xs text-gray-500 uppercase mb-1">Selected Element</div>
        <div className="font-mono text-sm bg-gray-800 text-green-400 px-2 py-1 rounded">
          &lt;{elementData.tagName}&gt;
        </div>
        {elementData.id && (
          <div className="text-xs text-gray-600 mt-1">
            ID: <span className="font-mono">{elementData.id}</span>
          </div>
        )}
      </div>

      {/* Text Content Editor */}
      {elementData.hasDirectText && (
        <div className="p-4 border-b">
          <div className="flex items-center gap-2 mb-2">
            <Type className="h-4 w-4 text-gray-600" />
            <label className="text-sm font-semibold text-gray-700">
              {elementData.isEditableText ? 'Text Content (Persistent)' : 'Text Content (Temporary)'}
            </label>
          </div>
          {elementData.isEditableText && (
            <div className="mb-2 text-xs bg-green-50 text-green-800 p-2 rounded border border-green-200">
              ✓ <strong>Wrapped in EditableText component</strong>
              <br />
              Key: <code className="font-mono font-semibold">{elementData.contentKey}</code>
              <br />
              Changes will save to <code>contentDictionary.json</code> and persist
            </div>
          )}
          {!elementData.isEditableText && (
            <div className="mb-2 text-xs bg-yellow-50 text-yellow-800 p-2 rounded border border-yellow-200">
              ⚠️ <strong>Plain HTML element - not wrapped in EditableText</strong>
              <br />
              Changes only update the DOM temporarily. To persist changes, wrap this element in an EditableText component in the source code.
            </div>
          )}
          <textarea
            value={elementData.text}
            onChange={(e) => updateText(e.target.value)}
            placeholder="Enter text content..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            rows={3}
          />
        </div>
      )}
      
      {!elementData.hasDirectText && (
        <div className="p-4 border-b bg-yellow-50">
          <div className="flex items-center gap-2 mb-2">
            <Type className="h-4 w-4 text-yellow-600" />
            <label className="text-sm font-semibold text-yellow-900">No Direct Text</label>
          </div>
          <p className="text-xs text-yellow-800">
            This element doesn&apos;t have direct text content. It may contain child elements with text. 
            Click on the specific text you want to edit.
          </p>
        </div>
      )}

      {/* Style Controls */}
      <div className="p-4 border-b">
        <div className="flex items-center gap-2 mb-3">
          <Palette className="h-4 w-4 text-gray-600" />
          <label className="text-sm font-semibold text-gray-700">Colors</label>
        </div>
        
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Text Color</label>
            <div className="flex gap-2">
              <input
                type="color"
                value={rgbToHex(elementData.styles.color)}
                onChange={(e) => updateStyle('color', e.target.value)}
                className="w-12 h-10 rounded border cursor-pointer"
              />
              <input
                type="text"
                value={elementData.styles.color}
                onChange={(e) => updateStyle('color', e.target.value)}
                className="flex-1 px-2 py-1 border rounded text-sm font-mono"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-600 mb-1 block">Background Color</label>
            <div className="flex gap-2">
              <input
                type="color"
                value={rgbToHex(elementData.styles.backgroundColor)}
                onChange={(e) => updateStyle('backgroundColor', e.target.value)}
                className="w-12 h-10 rounded border cursor-pointer"
              />
              <input
                type="text"
                value={elementData.styles.backgroundColor}
                onChange={(e) => updateStyle('backgroundColor', e.target.value)}
                className="flex-1 px-2 py-1 border rounded text-sm font-mono"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Typography */}
      <div className="p-4 border-b">
        <div className="flex items-center gap-2 mb-3">
          <Type className="h-4 w-4 text-gray-600" />
          <label className="text-sm font-semibold text-gray-700">Typography</label>
        </div>
        
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Font Size</label>
            <input
              type="text"
              value={elementData.styles.fontSize}
              onChange={(e) => updateStyle('fontSize', e.target.value)}
              className="w-full px-2 py-1 border rounded text-sm font-mono"
            />
          </div>

          <div>
            <label className="text-xs text-gray-600 mb-1 block">Font Weight</label>
            <select
              value={elementData.styles.fontWeight}
              onChange={(e) => updateStyle('fontWeight', e.target.value)}
              className="w-full px-2 py-1 border rounded text-sm"
            >
              <option value="300">Light (300)</option>
              <option value="400">Normal (400)</option>
              <option value="500">Medium (500)</option>
              <option value="600">Semibold (600)</option>
              <option value="700">Bold (700)</option>
              <option value="800">Extra Bold (800)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Spacing */}
      <div className="p-4 border-b">
        <div className="flex items-center gap-2 mb-3">
          <Maximize2 className="h-4 w-4 text-gray-600" />
          <label className="text-sm font-semibold text-gray-700">Spacing</label>
        </div>
        
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Padding</label>
            <input
              type="text"
              value={elementData.styles.padding}
              onChange={(e) => updateStyle('padding', e.target.value)}
              placeholder="e.g. 16px or 1rem"
              className="w-full px-2 py-1 border rounded text-sm font-mono"
            />
          </div>

          <div>
            <label className="text-xs text-gray-600 mb-1 block">Margin</label>
            <input
              type="text"
              value={elementData.styles.margin}
              onChange={(e) => updateStyle('margin', e.target.value)}
              placeholder="e.g. 16px or 1rem"
              className="w-full px-2 py-1 border rounded text-sm font-mono"
            />
          </div>
        </div>
      </div>

      {/* Position Info */}
      <div className="p-4 bg-gray-50">
        <div className="flex items-center gap-2 mb-2">
          <Move className="h-4 w-4 text-gray-600" />
          <label className="text-sm font-semibold text-gray-700">Position</label>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-white p-2 rounded border">
            <div className="text-gray-500">Top</div>
            <div className="font-mono">{Math.round(elementData.position.top)}px</div>
          </div>
          <div className="bg-white p-2 rounded border">
            <div className="text-gray-500">Left</div>
            <div className="font-mono">{Math.round(elementData.position.left)}px</div>
          </div>
          <div className="bg-white p-2 rounded border">
            <div className="text-gray-500">Width</div>
            <div className="font-mono">{Math.round(elementData.styles.width)}px</div>
          </div>
          <div className="bg-white p-2 rounded border">
            <div className="text-gray-500">Height</div>
            <div className="font-mono">{Math.round(elementData.styles.height)}px</div>
          </div>
        </div>
      </div>

      {/* Tips */}
      <div className="p-4 bg-blue-50 text-xs text-blue-800">
        <Eye className="h-4 w-4 inline mr-1" />
        Click any element on the page to inspect and edit it
      </div>
    </div>
  );
}

// Helper function to convert rgb() to hex
function rgbToHex(rgb: string): string {
  if (rgb.startsWith('#')) return rgb;
  
  const match = rgb.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return '#000000';
  
  const r = parseInt(match[1]);
  const g = parseInt(match[2]);
  const b = parseInt(match[3]);
  
  return '#' + [r, g, b].map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}
