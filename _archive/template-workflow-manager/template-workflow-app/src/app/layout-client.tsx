'use client';

import { useState, useEffect } from 'react';
import { EditableProvider, useEditable } from '@/contexts/EditableContext';
import InspectorPanel from '@/components/InspectorPanel';
import BrandingPanel from '@/components/BrandingPanel';
import { Code2, MousePointer2, Save, X, CheckCircle, Edit3, Palette } from 'lucide-react';

function HoverEditTooltip({ elementKey, elementValue, rect }: { elementKey: string; elementValue: string; rect: DOMRect }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(elementValue);
  const { updateContent } = useEditable();

  if (!rect) return null;

  if (isEditing) {
    return (
      <div
        className="fixed z-[9999] bg-white border-2 border-primary-500 rounded-lg shadow-2xl p-3"
        style={{
          left: `${rect.left}px`,
          top: `${rect.bottom + 10}px`,
          minWidth: '300px',
        }}
      >
        <div className="flex flex-col gap-2">
          <div className="text-xs font-semibold text-gray-600">Edit Text</div>
          <input
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                updateContent(elementKey, editValue);
                setIsEditing(false);
              }
              if (e.key === 'Escape') setIsEditing(false);
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-primary-500 text-sm"
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setIsEditing(false)}
              className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                updateContent(elementKey, editValue);
                setIsEditing(false);
              }}
              className="px-3 py-1 text-xs bg-primary-600 text-white rounded hover:bg-primary-700"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed z-[9999] bg-gray-900 text-white rounded-lg shadow-2xl p-2 flex items-center gap-2 cursor-pointer hover:bg-gray-800"
      style={{
        left: `${rect.left}px`,
        top: `${rect.bottom + 5}px`,
      }}
      onClick={() => setIsEditing(true)}
    >
      <Edit3 className="h-4 w-4" />
      <span className="text-xs font-medium">Click to edit</span>
    </div>
  );
}

function DevModeToggle() {
  const { isEditMode, setEditMode, hoveredElement, setHoveredElement } = useEditable();
  const [selectedElement, setSelectedElement] = useState<HTMLElement | null>(null);
  const [pendingChanges, setPendingChanges] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showBranding, setShowBranding] = useState(false);

  useEffect(() => {
    if (!isEditMode) {
      setSelectedElement(null);
      setHoveredElement(null);
      return;
    }

    // Don't attach document event listeners since we're using overlay
    return () => {
      if (hoveredElement) {
        hoveredElement.style.outline = '';
        hoveredElement.style.outlineOffset = '';
      }
    };
  }, [isEditMode]);

  // Highlight selected element
  useEffect(() => {
    if (selectedElement) {
      selectedElement.style.outline = '3px solid #3b82f6';
      selectedElement.style.outlineOffset = '2px';
    }

    return () => {
      if (selectedElement) {
        selectedElement.style.outline = '';
        selectedElement.style.outlineOffset = '';
      }
    };
  }, [selectedElement]);

  const handleSaveChanges = async () => {
    if (pendingChanges.length === 0) return;
    
    setIsSaving(true);
    try {
      // Filter changes that have contentKey (are connected to content dictionary)
      const persistentChanges: Record<string, string> = {};
      pendingChanges.forEach(change => {
        if (change.type === 'text' && change.contentKey) {
          persistentChanges[change.contentKey] = change.value;
        }
      });
      
      if (Object.keys(persistentChanges).length === 0) {
        // Don't show error - just clear non-persistent changes silently
        setPendingChanges([]);
        setIsSaving(false);
        return;
      }
      
      const response = await fetch('/api/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(persistentChanges),
      });
      
      if (!response.ok) throw new Error('Save failed');
      
      setPendingChanges([]);
      setSaveSuccess(true);
      
      // Trigger custom event for layout save
      window.dispatchEvent(new CustomEvent('saveLayout'));
      
      // Reload the page to show updated content from backend
      setTimeout(() => {
        window.location.reload();
      }, 1500);
      
      // Hide success message after 3 seconds
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error('Failed to save changes:', error);
      alert('Failed to save changes. See console for details.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleExitEditor = () => {
    if (pendingChanges.length > 0) {
      const confirmExit = confirm('You have unsaved changes. Exit without saving?');
      if (!confirmExit) return;
    }
    
    setEditMode(false);
    setSelectedElement(null);
    setPendingChanges([]);
    
    // Trigger custom event for layout reset
    window.dispatchEvent(new CustomEvent('exitDevMode'));
  };

  return (
    <>
      <div className="dev-mode-controls fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {isEditMode && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowBranding(!showBranding)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg shadow-lg font-medium transition-all ${
                showBranding
                  ? 'bg-gradient-to-r from-[#FF5F00] to-[#541C59] text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
              }`}
              title="Toggle Branding Panel"
            >
              <Palette className="h-5 w-5" />
              Brand
            </button>
            
            <button
              onClick={handleSaveChanges}
              disabled={pendingChanges.length === 0 || isSaving}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg shadow-lg font-medium transition-all ${
                pendingChanges.length > 0
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
              title={`Save ${pendingChanges.length} change(s) to backend`}
            >
              <Save className="h-5 w-5" />
              {isSaving ? 'Saving...' : `Save (${pendingChanges.length})`}
            </button>
            
            <button
              onClick={handleExitEditor}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg shadow-lg font-medium hover:bg-red-700 transition-all"
              title="Exit visual editor"
            >
              <X className="h-5 w-5" />
              Exit
            </button>
          </div>
        )}
        
        {!isEditMode && (
          <button
            onClick={() => setEditMode(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg shadow-lg font-medium hover:bg-gray-900 transition-all"
            title="Enable visual editor mode"
          >
            <Code2 className="h-5 w-5" />
            Dev Mode: OFF
          </button>
        )}
      </div>

      {/* Dev Mode Selection Overlay */}
      {isEditMode && (
        <div 
          className="fixed inset-0 pointer-events-auto cursor-crosshair"
          style={{ 
            zIndex: 40,
            background: 'transparent'
          }}
          onClick={handleClick}
          onMouseOver={handleMouseOver}
          onMouseOut={handleMouseOut}
        />
      )}

      {/* Success Toast */}
      {saveSuccess && (
        <div className="fixed top-4 right-4 z-50 bg-green-600 text-white px-6 py-4 rounded-lg shadow-2xl flex items-center gap-3 animate-fade-in">
          <CheckCircle className="h-6 w-6" />
          <div>
            <div className="font-semibold">Changes Saved!</div>
            <div className="text-sm text-green-100">All changes have been saved to the backend</div>
          </div>
        </div>
      )}

      {isEditMode && selectedElement && (
        <div className="inspector-panel">
          <InspectorPanel
            selectedElement={selectedElement}
            onClose={() => setSelectedElement(null)}
            onUpdate={(updates) => {
              setPendingChanges(prev => [...prev, updates]);
              console.log('Element updated:', updates);
            }}
          />
        </div>
      )}

      {isEditMode && showBranding && (
        <BrandingPanel 
          selectedElement={selectedElement}
          onApplyColor={(property, color) => {
            if (selectedElement) {
              selectedElement.style[property as any] = color;
              setPendingChanges(prev => [...prev, { element: selectedElement, property, value: color }]);
            }
          }}
          onApplyImage={(imageUrl) => {
            if (selectedElement && selectedElement.tagName === 'IMG') {
              (selectedElement as HTMLImageElement).src = imageUrl;
              setPendingChanges(prev => [...prev, { element: selectedElement, property: 'src', value: imageUrl }]);
            }
          }}
        />
      )}

      {isEditMode && showBranding && <BrandingPanel />}

      {isEditMode && !selectedElement && (
        <div className="fixed top-20 right-4 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm z-40 animate-pulse">
          👆 Click any element to edit it
        </div>
      )}

      {/* Hover Text Edit Tooltip */}
      {isEditMode && hoveredElement && !selectedElement && (
        <HoverEditTooltip
          elementKey={hoveredElement.key}
          elementValue={hoveredElement.value}
          rect={hoveredElement.rect}
        />
      )}
    </>
  );
}

export function LayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <EditableProvider>
      {children}
      <DevModeToggle />
    </EditableProvider>
  );
}
