/**
 * BlockUpdate — unified type for all canvas update operations.
 *
 * Both entry points (text selection → "Edit with Compose" and agent chat → interpret intent)
 * produce BlockUpdate[] instructions that the canvas applies.
 */

export type BlockUpdateOperation = 'insert' | 'replace' | 'delete' | 'move';

export interface BlockUpdate {
  /** Unique ID for this update (for tracking/undo) */
  id: string;
  /** The operation to perform */
  operation: BlockUpdateOperation;
  /** Target block ID (for replace, delete, move) */
  targetBlockId?: string;
  /** New content (for insert, replace) */
  content?: string;
  /** Position — block ID to insert after, or 'start' for beginning */
  afterBlockId?: string | 'start';
  /** For move: the block ID to move after */
  moveAfterId?: string | 'start';
  /** Original content before update (for preview diff) */
  originalContent?: string;
  /** AI rationale for this change (P1 — explain, don't just show) */
  rationale?: string;
}

export interface BlockUpdateResult {
  updates: BlockUpdate[];
  summary: string;
  /** The intent that was interpreted from the user's input */
  interpretedIntent: string;
}

export type BlockUpdateStatus = 'pending' | 'previewing' | 'applied' | 'rejected';

export interface BlockUpdateWithStatus extends BlockUpdate {
  status: BlockUpdateStatus;
}

/** Chat message in the agent panel */
export interface AgentChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  /** If the assistant message produced block updates */
  updates?: BlockUpdateWithStatus[];
}
