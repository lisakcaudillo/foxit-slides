'use client';

import { useState } from 'react';
import {
  X,
  Undo2,
  Redo2,
  Search,
  Image,
  Table,
  Link2,
  PenTool,
  SeparatorHorizontal,
  Sparkles,
  Wand2,
  BrainCircuit,
  Shield,
  Lock,
  Stamp,
  Droplets,
  FileSignature,
  Calendar,
  ListOrdered,
  Send,
  Plus,
  Trash2,
  CheckSquare,
  Type,
  Hash,
  ChevronDown,
  ChevronUp,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { SignField, SignParty } from '@/types';
import { isFoxitReady } from '@/lib/foxit';

interface ToolAction {
  id: string;
  label: string;
  icon: LucideIcon;
  action: string;
  badge?: string;
}

interface ToolTier {
  id: string;
  label: string;
  items: ToolAction[];
}

interface EditorToolPanelProps {
  isOpen: boolean;
  onToggle: () => void;

  onToolAction?: (actionId: string) => void;
  canUndo?: boolean;
  canRedo?: boolean;
  // eSign props
  parties?: SignParty[];
  onAddParty?: (party: SignParty) => void;
  onRemoveParty?: (index: number) => void;
  onSelectPendingField?: (field: Omit<SignField, 'id'> | null) => void;
  selectedPartyIndex?: number;
  onSelectParty?: (index: number) => void;
  pendingField?: Omit<SignField, 'id'> | null;
  totalFieldCount?: number;
  signingOrder?: 'sequential' | 'parallel';
  onToggleSigningOrder?: () => void;
  onSendForSignature?: () => void;
}

const PARTY_COLORS = ['#8b5cf6', '#10b981', '#f59e0b', '#f43f5e', '#3b82f6', '#14b8a6', '#ec4899', '#6366f1'];

const PARTY_COLOR_CLASSES: Record<number, { dot: string; bg: string; border: string; text: string }> = {
  0: { dot: 'bg-violet-500', bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700' },
  1: { dot: 'bg-emerald-500', bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700' },
  2: { dot: 'bg-amber-500', bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700' },
  3: { dot: 'bg-rose-500', bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700' },
  4: { dot: 'bg-blue-500', bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700' },
  5: { dot: 'bg-teal-500', bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-700' },
  6: { dot: 'bg-pink-500', bg: 'bg-pink-50', border: 'border-pink-200', text: 'text-pink-700' },
  7: { dot: 'bg-indigo-500', bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700' },
};

function getPartyClasses(index: number) {
  return PARTY_COLOR_CLASSES[index] ?? PARTY_COLOR_CLASSES[0];
}

const FIELD_CHIPS: { type: SignField['type']; label: string; icon: typeof PenTool }[] = [
  { type: 'signature', label: 'Signature', icon: PenTool },
  { type: 'initial', label: 'Initial', icon: Hash },
  { type: 'date', label: 'Date', icon: Calendar },
  { type: 'text', label: 'Text', icon: Type },
  { type: 'checkbox', label: 'Checkbox', icon: CheckSquare },
];

const toolTiers: ToolTier[] = [
  {
    id: 'edit',
    label: 'Edit',
    items: [
      { id: 'undo', label: 'Undo', icon: Undo2, action: 'undo' },
      { id: 'redo', label: 'Redo', icon: Redo2, action: 'redo' },
      { id: 'find-replace', label: 'Find & Replace', icon: Search, action: 'find-replace' },
    ],
  },
  {
    id: 'insert',
    label: 'Insert',
    items: [
      { id: 'insert-table', label: 'Table', icon: Table, action: 'insert-table' },
      { id: 'insert-image', label: 'Image', icon: Image, action: 'insert-image' },
      { id: 'insert-link', label: 'Link', icon: Link2, action: 'insert-link' },
      { id: 'insert-pagebreak', label: 'Page Break', icon: SeparatorHorizontal, action: 'organize-pagebreak' },
    ],
  },
  {
    id: 'ai',
    label: 'Writing Tools',
    items: [
      { id: 'summarize', label: 'Summarize', icon: Sparkles, action: 'summarize' },
      { id: 'rewrite', label: 'Rewrite', icon: Wand2, action: 'rewrite' },
      { id: 'extract-fields', label: 'Key Points', icon: BrainCircuit, action: 'extract-fields' },
      { id: 'classify', label: 'Classify', icon: Shield, action: 'classify' },
      { id: 'compliance-check', label: 'Check for Sensitive Info', icon: Shield, action: 'compliance-check' },
    ],
  },
  {
    id: 'foxit',
    label: 'Document',
    items: [
      { id: 'foxit-redact', label: 'Remove Sensitive Content', icon: Shield, action: 'foxit-redact' },
      { id: 'foxit-watermark', label: 'Add Watermark', icon: Droplets, action: 'foxit-watermark' },
      { id: 'foxit-digital-sig', label: 'Sign', icon: Stamp, action: 'foxit-digital-sig' },
      { id: 'foxit-protect', label: 'Lock', icon: Lock, action: 'foxit-protect' },
      { id: 'foxit-export-pdf', label: 'Export', icon: FileSignature, action: 'foxit-export-pdf' },
    ],
  },
];

// --- Add Party Form ---

function AddPartyForm({
  onAdd,
  onCancel,
  nextIndex,
}: {
  onAdd: (party: SignParty) => void;
  onCancel: () => void;
  nextIndex: number;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<string>('Signer');

  const handleSubmit = () => {
    if (!name.trim() || !email.trim()) return;
    onAdd({
      name: name.trim(),
      email: email.trim(),
      role,
      color: PARTY_COLORS[nextIndex % PARTY_COLORS.length],
    });
    setName('');
    setEmail('');
    setRole('Signer');
  };

  return (
    <div className="border border-slate-200 rounded-lg p-3 space-y-2 bg-slate-50/50">
      <input
        type="text"
        placeholder="Full name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full text-sm rounded-md border border-slate-200 px-2.5 py-1.5 outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-400"
      />
      <input
        type="email"
        placeholder="Email address"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full text-sm rounded-md border border-slate-200 px-2.5 py-1.5 outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-400"
      />
      <select
        value={role}
        onChange={(e) => setRole(e.target.value)}
        className="w-full text-sm rounded-md border border-slate-200 px-2.5 py-1.5 outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-400 bg-white"
      >
        <option value="Signer">Signer</option>
        <option value="Approver">Approver</option>
        <option value="Viewer">Viewer</option>
      </select>
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={handleSubmit}
          disabled={!name.trim() || !email.trim()}
          className="flex-1 h-8 rounded-md bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 transition-colors disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed"
        >
          Add Party
        </button>
        <button
          onClick={onCancel}
          className="h-8 px-3 rounded-md text-xs font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// --- eSign Section ---

export function ESignSection({
  parties,
  onAddParty,
  onRemoveParty,
  onSelectPendingField,
  selectedPartyIndex,
  onSelectParty,
  pendingField,
  totalFieldCount,
  signingOrder,
  onToggleSigningOrder,
  onSendForSignature,
}: {
  parties: SignParty[];
  onAddParty: (party: SignParty) => void;
  onRemoveParty: (index: number) => void;
  onSelectPendingField: (field: Omit<SignField, 'id'> | null) => void;
  selectedPartyIndex: number;
  onSelectParty: (index: number) => void;
  pendingField: Omit<SignField, 'id'> | null;
  totalFieldCount: number;
  signingOrder: 'sequential' | 'parallel';
  onToggleSigningOrder: () => void;
  onSendForSignature: () => void;
}) {
  const [showAddParty, setShowAddParty] = useState(false);
  const [partiesExpanded, setPartiesExpanded] = useState(true);
  const [fieldsExpanded, setFieldsExpanded] = useState(true);

  return (
    <div className="px-3 mb-4">
      <div className="px-2 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
        <FileSignature className="size-3.5" />
        Signatures
      </div>

      {/* Parties Section */}
      <div className="mb-3">
        <button
          onClick={() => setPartiesExpanded(!partiesExpanded)}
          className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-800 transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <Users className="size-3.5" />
            Parties ({parties.length})
          </span>
          {partiesExpanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
        </button>

        {partiesExpanded && (
          <div className="space-y-1.5 mt-1 px-1">
            {parties.map((party, index) => {
              const colors = getPartyClasses(index);
              const isSelected = selectedPartyIndex === index;
              return (
                <div
                  key={`${party.email}-${index}`}
                  onClick={() => onSelectParty(index)}
                  className={`flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-colors border ${
                    isSelected
                      ? `${colors.bg} ${colors.border}`
                      : 'border-transparent hover:bg-slate-50'
                  }`}
                >
                  <div className={`size-2.5 rounded-full flex-shrink-0 ${colors.dot}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-800 truncate">{party.name}</div>
                    <div className="text-[11px] text-slate-500 truncate">{party.email}</div>
                  </div>
                  <span className="text-[10px] font-medium text-slate-400 uppercase flex-shrink-0">{party.role}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveParty(index);
                    }}
                    className="opacity-0 group-hover:opacity-100 min-h-[44px] min-w-[44px] rounded hover:bg-red-50 flex items-center justify-center text-slate-400 hover:text-red-500 transition-all flex-shrink-0"
                    style={{ opacity: undefined }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '0'; }}
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              );
            })}

            {showAddParty ? (
              <AddPartyForm
                onAdd={(party) => {
                  onAddParty(party);
                  setShowAddParty(false);
                }}
                onCancel={() => setShowAddParty(false)}
                nextIndex={parties.length}
              />
            ) : (
              <button
                onClick={() => setShowAddParty(true)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-50 text-slate-500 hover:text-slate-700 transition-colors text-left"
              >
                <Plus className="size-3.5" />
                <span className="text-xs font-medium">Add Party</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Field Placement Section */}
      <div className="mb-3">
        <button
          onClick={() => setFieldsExpanded(!fieldsExpanded)}
          className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-800 transition-colors"
        >
          <span>Place Fields</span>
          {fieldsExpanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
        </button>

        {fieldsExpanded && (
          <div className="mt-1 px-1">
            {parties.length === 0 ? (
              <p className="text-xs text-slate-400 px-2 py-2">Add a party first to place fields.</p>
            ) : (
              <>
                <div className="text-[11px] text-slate-500 px-2 mb-2">
                  Placing for: <span className={`font-medium ${getPartyClasses(selectedPartyIndex).text}`}>{parties[selectedPartyIndex]?.name ?? 'Unknown'}</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {FIELD_CHIPS.map((chip) => {
                    const colors = getPartyClasses(selectedPartyIndex);
                    const Icon = chip.icon;
                    const isActive = pendingField?.type === chip.type && pendingField?.partyIndex === selectedPartyIndex;
                    return (
                      <button
                        key={chip.type}
                        onClick={() => {
                          if (isActive) {
                            onSelectPendingField(null);
                          } else {
                            onSelectPendingField({
                              type: chip.type,
                              partyIndex: selectedPartyIndex,
                              label: chip.label,
                            });
                          }
                        }}
                        className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg border text-xs font-medium transition-all ${
                          isActive
                            ? `${colors.bg} ${colors.border} ${colors.text} ring-1 ring-offset-1`
                            : `border-slate-200 text-slate-600 hover:${colors.bg} hover:${colors.border} hover:${colors.text}`
                        }`}
                      >
                        <Icon className="size-3.5" />
                        {chip.label}
                      </button>
                    );
                  })}
                </div>
                {pendingField && (
                  <p className="text-[11px] text-violet-600 px-2 mt-2 animate-pulse">
                    Click on a block in the canvas to place the field.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Send Section */}
      <div className="px-1 pt-2 border-t border-slate-100">
        <div className="flex items-center justify-between px-2 mb-2">
          <span className="text-[11px] text-slate-500">
            {parties.length} {parties.length === 1 ? 'party' : 'parties'} &middot; {totalFieldCount} {totalFieldCount === 1 ? 'field' : 'fields'}
          </span>
          <button
            onClick={onToggleSigningOrder}
            className="text-[11px] font-medium text-slate-500 hover:text-slate-700 flex items-center gap-1 transition-colors"
          >
            <ListOrdered className="size-3" />
            {signingOrder === 'sequential' ? 'Sequential' : 'Parallel'}
          </button>
        </div>
        <button
          onClick={onSendForSignature}
          disabled={parties.length === 0 || totalFieldCount === 0}
          className="w-full flex items-center justify-center gap-2 h-9 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed"
        >
          <Send className="size-3.5" />
          Send for Signature
        </button>
      </div>
    </div>
  );
}

export default function EditorToolPanel({
  isOpen,
  onToggle,
  onToolAction,
  canUndo = true,
  canRedo = true,
  parties = [],
  onAddParty,
  onRemoveParty,
  onSelectPendingField,
  selectedPartyIndex = 0,
  onSelectParty,
  pendingField = null,
  totalFieldCount = 0,
  signingOrder = 'sequential',
  onToggleSigningOrder,
  onSendForSignature,
}: EditorToolPanelProps) {
  const foxitReady = isFoxitReady();

  const isToolDisabled = (actionId: string): boolean => {
    if (actionId === 'undo') return !canUndo;
    if (actionId === 'redo') return !canRedo;
    return false;
  };

  const handleAction = (actionId: string) => {
    if (isToolDisabled(actionId)) return;
    if (onToolAction) {
      onToolAction(actionId);
    }
  };

  if (!isOpen) return null;

  // Filter out the old esign tier — it renders the interactive one instead

  return (
    <>
      {/* Backdrop — transparent click-to-close, no blur so user can see canvas */}
      <div
        className="fixed inset-0 z-30"
        onClick={onToggle}
      />

      {/* Drawer */}
      <aside className="fixed right-0 top-0 bottom-0 w-72 bg-white border-l border-slate-200 flex flex-col z-40 shadow-xl animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="h-14 px-4 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
          <h2 className="font-semibold text-slate-900 text-sm">Tools</h2>
          <button
            onClick={onToggle}
            className="size-8 rounded-lg hover:bg-slate-50 flex items-center justify-center text-slate-500 transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Tool Tiers */}
        <div className="flex-1 overflow-y-auto py-2">
          {toolTiers
            .filter((tier) => tier.id !== 'foxit' || foxitReady)
            .map((tier) => (
            <div key={tier.id} className="px-3 mb-4">
              <div className="px-2 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {tier.label}
              </div>
              <div className="space-y-0.5">
                {tier.items.map((item) => {
                  const Icon = item.icon;
                  const disabled = isToolDisabled(item.action);
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleAction(item.action)}
                      disabled={disabled}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left group ${
                        disabled
                          ? 'text-slate-300 cursor-not-allowed'
                          : 'hover:bg-slate-50 text-slate-700 hover:text-slate-900'
                      }`}
                    >
                      <Icon className={`size-4 flex-shrink-0 ${disabled ? 'text-slate-300' : 'text-slate-400 group-hover:text-slate-600'}`} />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium">{item.label}</span>
                        {item.badge && (
                          <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                            {item.badge}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* eSign section removed — now accessed via "Prepare for Signing" button */}
        </div>
      </aside>
    </>
  );
}
