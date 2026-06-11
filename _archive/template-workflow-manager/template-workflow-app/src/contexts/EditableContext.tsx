'use client';

import { createContext, useContext, useState, ReactNode, useEffect } from 'react';

interface EditableContextType {
  isEditMode: boolean;
  setEditMode: (mode: boolean) => void;
  updateContent: (key: string, value: string) => void;
  getContent: (key: string, defaultValue: string) => string;
  hoveredElement: { key: string; value: string; rect: DOMRect } | null;
  setHoveredElement: (element: { key: string; value: string; rect: DOMRect } | null) => void;
}

const EditableContext = createContext<EditableContextType | undefined>(undefined);

export function EditableProvider({ children }: { children: ReactNode }) {
  const [isEditMode, setIsEditMode] = useState(false);
  const [content, setContent] = useState<Record<string, string>>({});
  const [hoveredElement, setHoveredElement] = useState<{ key: string; value: string; rect: DOMRect } | null>(null);

  // Load saved content from API on mount
  useEffect(() => {
    fetch('/api/content')
      .then(res => res.json())
      .then(data => setContent(data))
      .catch(err => console.error('Failed to load content:', err));
  }, []);

  const setEditMode = (mode: boolean) => {
    setIsEditMode(mode);
    if (!mode) {
      setHoveredElement(null);
    }
  };

  const updateContent = (key: string, value: string) => {
    const newContent = { ...content, [key]: value };
    setContent(newContent);
  };

  const getContent = (key: string, defaultValue: string): string => {
    return content[key] || defaultValue;
  };

  return (
    <EditableContext.Provider value={{ isEditMode, setEditMode, updateContent, getContent, hoveredElement, setHoveredElement }}>
      {children}
    </EditableContext.Provider>
  );
}

export function useEditable() {
  const context = useContext(EditableContext);
  if (!context) {
    throw new Error('useEditable must be used within EditableProvider');
  }
  return context;
}
