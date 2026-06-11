'use client';

import { useState } from 'react';
import { Palette, Image, Layers, ChevronDown, ChevronUp, Upload } from 'lucide-react';

interface BrandingPanelProps {
  selectedElement?: HTMLElement | null;
  onApplyColor?: (property: string, color: string) => void;
  onApplyImage?: (imageUrl: string) => void;
}

const FOXIT_COLORS = {
  'Foxit Orange': {
    primary: '#FF5F00',
    shades: ['#430907', '#A1350B', '#CC4302', '#E1520F', '#FC7734', '#FDA174', '#FEC8AA', '#FFF0E7', '#FFFBF9']
  },
  'Shadowberry': {
    primary: '#401842',
    shades: ['#541C59', '#782781', '#922D9E', '#A236B2', '#C859DC', '#DB88EA', '#E8B4F3', '#F1D5F9', '#F9EBFC', '#FCF5FE']
  },
  'Eclipse': {
    primary: '#0E0C36',
    shades: ['#252442', '#3E3E71', '#47468D', '#5854AE', '#6462C6', '#7E83D6', '#98A1E1', '#B6C1EB', '#D1D9F4', '#E6EBF9']
  },
  'Golden': {
    primary: '#FFAA19',
    shades: []
  }
};

const FOXIT_GRADIENTS = [
  { name: 'Light', from: '#FFFFFF', to: '#FFF0E7', label: 'White to Light Orange' },
  { name: 'Medium', from: '#FF5F00', to: '#541C59', label: 'Orange to Shadowberry' },
  { name: 'Dark', from: '#0E0C36', to: '#401842', label: 'Eclipse to Shadowberry' },
];

export default function BrandingPanel({ selectedElement, onApplyColor, onApplyImage }: BrandingPanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [expanded, setExpanded] = useState({
    selectedElement: true,
    colors: true,
    gradients: false,
    logos: false,
    typography: false,
  });
  const [imageUrl, setImageUrl] = useState('');
  const [activeColorProperty, setActiveColorProperty] = useState<'color' | 'backgroundColor' | 'borderColor' | null>(null);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handleColorClick = (color: string) => {
    if (selectedElement && activeColorProperty && onApplyColor) {
      onApplyColor(activeColorProperty, color);
      // Show visual feedback
      const property = activeColorProperty;
      setTimeout(() => {
        if (property === activeColorProperty) {
          setActiveColorProperty(null);
        }
      }, 2000);
    } else {
      copyToClipboard(color);
    }
  };

  if (isCollapsed) {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setIsCollapsed(false);
        }}
        onMouseEnter={(e) => e.stopPropagation()}
        onMouseLeave={(e) => e.stopPropagation()}
        onMouseDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
        className="fixed left-4 top-20 bg-gradient-to-r from-[#FF5F00] to-[#541C59] text-white p-3 rounded-lg shadow-xl hover:scale-105 transition-transform pointer-events-auto"
        style={{ zIndex: 9999 }}
        title="Show Branding Panel"
        data-dev-tool-ignore="true"
      >
        <Palette className="h-5 w-5" />
      </button>
    );
  }

  return (
    <div 
      className="fixed left-4 top-20 w-80 bg-white border-2 border-gray-300 rounded-lg shadow-xl max-h-[calc(100vh-100px)] overflow-y-auto pointer-events-auto"
      style={{ zIndex: 9999 }}
      onMouseDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
      }}
      onMouseEnter={(e) => e.stopPropagation()}
      onMouseLeave={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      data-dev-tool-ignore="true"
    >
      <div className="bg-gradient-to-r from-[#FF5F00] to-[#541C59] p-4 flex items-center justify-between">
        <h3 className="text-white font-bold text-lg flex items-center gap-2">
          <Palette className="h-5 w-5" />
          Foxit Branding
        </h3>
        <button
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setIsCollapsed(true);
          }}
          onMouseDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
          className="text-white hover:bg-white/20 p-1 rounded transition-colors"
          title="Minimize Panel"
        >
          <ChevronUp className="h-5 w-5" />
        </button>
      </div>

      {/* Selected Element Actions */}
      {selectedElement && (
        <div className="border-b border-gray-200 bg-blue-50">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(prev => ({ ...prev, selectedElement: !prev.selectedElement }));
            }}
            className="w-full p-4 flex items-center justify-between hover:bg-blue-100"
          >
            <span className="font-semibold text-sm text-blue-900">Selected Element</span>
            {expanded.selectedElement ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          
          {expanded.selectedElement && (
            <div className="p-4 space-y-3">
              <div className="text-xs text-gray-600 mb-2">
                <strong>{selectedElement.tagName.toLowerCase()}</strong>
                {selectedElement.className && <span className="ml-2">(.{selectedElement.className.split(' ')[0]})</span>}
              </div>

              {/* Image Upload for IMG tags */}
              {selectedElement.tagName === 'IMG' && (
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-2">Change Image</label>
                  <input
                    type="text"
                    placeholder="Enter image URL"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded mb-2"
                  />
                  <button
                    onClick={() => {
                      if (imageUrl && onApplyImage) {
                        onApplyImage(imageUrl);
                        setImageUrl('');
                      }
                    }}
                    disabled={!imageUrl}
                    className="w-full px-3 py-2 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <Upload className="h-3 w-3" />
                    Apply Image
                  </button>
                </div>
              )}

              {/* Color Actions */}
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-2">Apply Brand Color To:</label>
                <div className="space-y-2">
                  <button
                    onClick={() => {
                      setActiveColorProperty('color');
                      setExpanded(prev => ({ ...prev, colors: true }));
                    }}
                    className={`w-full px-3 py-2 border text-xs rounded text-left transition-colors ${
                      activeColorProperty === 'color'
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    🎨 Text Color {activeColorProperty === 'color' && '← Active'}
                  </button>
                  <button
                    onClick={() => {
                      setActiveColorProperty('backgroundColor');
                      setExpanded(prev => ({ ...prev, colors: true }));
                    }}
                    className={`w-full px-3 py-2 border text-xs rounded text-left transition-colors ${
                      activeColorProperty === 'backgroundColor'
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    🖌️ Background {activeColorProperty === 'backgroundColor' && '← Active'}
                  </button>
                  <button
                    onClick={() => {
                      setActiveColorProperty('borderColor');
                      setExpanded(prev => ({ ...prev, colors: true }));
                    }}
                    className={`w-full px-3 py-2 border text-xs rounded text-left transition-colors ${
                      activeColorProperty === 'borderColor'
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    🔲 Border {activeColorProperty === 'borderColor' && '← Active'}
                  </button>
                </div>
                {activeColorProperty ? (
                  <p className="text-[10px] text-blue-600 mt-2 font-semibold">
                    ✓ Click any Foxit brand color below to apply
                  </p>
                ) : (
                  <p className="text-[10px] text-gray-500 mt-2">
                    ℹ️ Select a property above, then choose from approved brand colors only
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Colors Section */}
      <div className="border-b border-gray-200">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(prev => ({ ...prev, colors: !prev.colors }));
          }}
          className="w-full p-4 flex items-center justify-between hover:bg-gray-50"
        >
          <span className="font-semibold text-sm">Brand Colors (Approved Only)</span>
          {expanded.colors ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        
        {expanded.colors && (
          <div className="p-4 space-y-4">
            {Object.entries(FOXIT_COLORS).map(([name, { primary, shades }]) => (
              <div key={name}>
                <div className="text-xs font-medium text-gray-700 mb-2">{name}</div>
                <div className="flex flex-wrap gap-2">
                  {/* Primary Color */}
                  <button
                    onClick={() => handleColorClick(primary)}
                    className="group relative"
                    title={activeColorProperty ? `Apply ${primary} to ${activeColorProperty}` : `Click to copy ${primary}`}
                  >
                    <div
                      className="w-10 h-10 rounded border-2 border-gray-300 hover:scale-110 transition-transform cursor-pointer"
                      style={{ backgroundColor: primary }}
                    />
                    <div className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 text-xs opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                      {primary}
                    </div>
                  </button>
                  
                  {/* Shades */}
                  {shades.map((shade) => (
                    <button
                      key={shade}
                      onClick={() => handleColorClick(shade)}
                      className="group relative"
                      title={activeColorProperty ? `Apply ${shade} to ${activeColorProperty}` : `Click to copy ${shade}`}
                    >
                      <div
                        className="w-8 h-8 rounded border border-gray-300 hover:scale-110 transition-transform cursor-pointer"
                        style={{ backgroundColor: shade }}
                      />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Gradients Section */}
      <div className="border-b border-gray-200">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(prev => ({ ...prev, gradients: !prev.gradients }));
          }}
          className="w-full p-4 flex items-center justify-between hover:bg-gray-50"
        >
          <span className="font-semibold text-sm">Gradients</span>
          {expanded.gradients ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        
        {expanded.gradients && (
          <div className="p-4 space-y-3">
            {FOXIT_GRADIENTS.map((gradient) => (
              <button
                key={gradient.name}
                onClick={() => copyToClipboard(`linear-gradient(to right, ${gradient.from}, ${gradient.to})`)}
                className="w-full text-left group"
                title="Click to copy gradient CSS"
              >
                <div
                  className="h-12 rounded-lg mb-2 border-2 border-gray-300 hover:border-gray-400 transition-colors"
                  style={{ background: `linear-gradient(to right, ${gradient.from}, ${gradient.to})` }}
                />
                <div className="text-xs font-medium">{gradient.name}</div>
                <div className="text-xs text-gray-600">{gradient.label}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Logos Section */}
      <div className="border-b border-gray-200">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(prev => ({ ...prev, logos: !prev.logos }));
          }}
          className="w-full p-4 flex items-center justify-between hover:bg-gray-50"
        >
          <span className="font-semibold text-sm">Logo Variants</span>
          {expanded.logos ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        
        {expanded.logos && (
          <div className="p-4 space-y-3">
            <div className="text-xs text-gray-600 mb-3">
              Right-click any logo to save or copy
            </div>
            
            {/* Dark Gradient Background */}
            <div className="group">
              <div className="text-xs font-medium mb-2">Dark Gradient</div>
              <div 
                className="p-4 rounded-lg bg-gradient-to-r from-[#0E0C36] to-[#401842] flex items-center justify-center"
              >
                <img 
                  src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 80'%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='white' font-family='Arial' font-weight='bold' font-size='40' font-style='italic'%3Efoxit%3C/text%3E%3C/svg%3E"
                  alt="Foxit Logo - Dark"
                  className="h-12"
                  draggable="true"
                />
              </div>
            </div>

            {/* Orange Background */}
            <div className="group">
              <div className="text-xs font-medium mb-2">Orange</div>
              <div className="p-4 rounded-lg bg-[#FF5F00] flex items-center justify-center">
                <img 
                  src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 80'%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='white' font-family='Arial' font-weight='bold' font-size='40' font-style='italic'%3Efoxit%3C/text%3E%3C/svg%3E"
                  alt="Foxit Logo - Orange"
                  className="h-12"
                  draggable="true"
                />
              </div>
            </div>

            {/* White Background */}
            <div className="group">
              <div className="text-xs font-medium mb-2">Light</div>
              <div className="p-4 rounded-lg bg-white border-2 border-gray-200 flex items-center justify-center">
                <img 
                  src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 80'%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23FF5F00' font-family='Arial' font-weight='bold' font-size='40' font-style='italic'%3Efoxit%3C/text%3E%3C/svg%3E"
                  alt="Foxit Logo - Light"
                  className="h-12"
                  draggable="true"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Typography Section */}
      <div className="border-b border-gray-200">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(prev => ({ ...prev, typography: !prev.typography }));
          }}
          className="w-full p-4 flex items-center justify-between hover:bg-gray-50"
        >
          <span className="font-semibold text-sm">Typography</span>
          {expanded.typography ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        
        {expanded.typography && (
          <div className="p-4 space-y-4 text-xs">
            {/* Barlow */}
            <div>
              <div className="font-semibold mb-2 flex items-center justify-between">
                <span>Barlow (Headlines)</span>
                <span className="text-[10px] text-gray-500">Sans-serif</span>
              </div>
              <div className="space-y-1 text-gray-700">
                <div style={{ fontFamily: 'Barlow, sans-serif', fontWeight: 400 }}>Regular - Aa Bb Cc</div>
                <div style={{ fontFamily: 'Barlow, sans-serif', fontWeight: 500 }}>Medium - Aa Bb Cc</div>
                <div style={{ fontFamily: 'Barlow, sans-serif', fontWeight: 600 }}>SemiBold - Aa Bb Cc</div>
                <div style={{ fontFamily: 'Barlow, sans-serif', fontWeight: 700 }}>Bold - Aa Bb Cc</div>
                <div style={{ fontFamily: 'Barlow, sans-serif', fontWeight: 800 }}>ExtraBold - Aa Bb Cc</div>
                <div style={{ fontFamily: 'Barlow, sans-serif', fontWeight: 900 }}>Black - Aa Bb Cc</div>
              </div>
              <div className="mt-2 text-[10px] text-red-600">
                ⚠️ Do not use Barlow Condensed or Semi Condensed
              </div>
            </div>

            {/* Open Sans */}
            <div>
              <div className="font-semibold mb-2 flex items-center justify-between">
                <span>Open Sans (Body)</span>
                <span className="text-[10px] text-gray-500">Sans-serif</span>
              </div>
              <div className="space-y-1 text-gray-700">
                <div style={{ fontFamily: 'Open Sans, sans-serif', fontWeight: 300 }}>Light - Aa Bb Cc</div>
                <div style={{ fontFamily: 'Open Sans, sans-serif', fontWeight: 400 }}>Regular - Aa Bb Cc</div>
                <div style={{ fontFamily: 'Open Sans, sans-serif', fontWeight: 600 }}>SemiBold - Aa Bb Cc (CTA)</div>
                <div style={{ fontFamily: 'Open Sans, sans-serif', fontWeight: 700 }}>Bold - Aa Bb Cc</div>
                <div style={{ fontFamily: 'Open Sans, sans-serif', fontWeight: 800 }}>ExtraBold - Aa Bb Cc</div>
              </div>
              <div className="mt-2 text-[10px] text-blue-600">
                ✓ Ideal for digital, body text, and CTAs
              </div>
            </div>

            {/* Tahoma */}
            <div>
              <div className="font-semibold mb-2 flex items-center justify-between">
                <span>Tahoma (Fallback)</span>
                <span className="text-[10px] text-gray-500">Web-safe</span>
              </div>
              <div className="space-y-1 text-gray-700">
                <div style={{ fontFamily: 'Tahoma, sans-serif', fontWeight: 400 }}>Regular - Aa Bb Cc</div>
                <div style={{ fontFamily: 'Tahoma, sans-serif', fontWeight: 700 }}>Bold - Aa Bb Cc</div>
              </div>
            </div>

            {/* Typography Rules */}
            <div className="border-t border-gray-200 pt-3">
              <div className="font-semibold mb-2">Typography Rules</div>
              <ul className="space-y-1 text-[10px] text-gray-700">
                <li>✓ Headlines: Title Case, vary weights</li>
                <li>✓ Eyebrows: ALL CAPS (max 3 words)</li>
                <li>✓ CTAs: Open Sans SemiBold (max 3 words)</li>
                <li>⚠️ NO all caps (except eyebrows)</li>
                <li>⚠️ NO condensed fonts</li>
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* CTA Guidelines */}
      <div className="p-4 bg-gray-50 text-xs text-gray-600">
        <div className="font-semibold mb-2">CTA Guidelines:</div>
        <ul className="space-y-1 list-disc list-inside">
          <li>Radius: 5-10px</li>
          <li>Padding: 16px/32px</li>
          <li>Font: Open Sans Semibold 18px</li>
          <li>Max 3 words</li>
        </ul>
      </div>
    </div>
  );
}
