// Forced-tool schemas for the card-engine's two structured-generation calls.
//
// These mirror the Zod schemas in ./types.ts (ContentClassificationSchema and
// GeneratedCardSchema) as JSON-Schema tool definitions so the calls run through
// the provider's tool path. On OpenAI that means Structured Outputs strict mode
// (see ai-provider/strict-schema.ts) — the model is FORCED to honour the enums
// instead of merely being asked to in the prompt. This closes the long-standing
// free-form-JSON-parsing gap: gpt-4o returned off-enum `contentType` /
// `suggestedLayout` / block-type values that Claude happened to obey, breaking
// generation. Carry every enum from the Zod source verbatim — a bare
// {type:'string'} reproduces the failure.
//
// Optional Zod fields stay optional here; the OpenAI adapter makes them nullable
// for strict mode and strips the resulting nulls so `.optional()` still validates.

import type { Tool } from '@/lib/ai-provider';
import {
  BLOCK_TEMPLATES,
  SMART_LAYOUT_VARIANTS,
  IMAGE_STYLES,
  IMAGE_PLACEMENTS,
} from './types';

/** Mirrors ContentClassificationSchema (types.ts). */
export const CLASSIFY_TOOL: Tool = {
  name: 'report_classification',
  description:
    'Return the content classification: type, card count, the ordered sections (each with a layout and block template), audiences, tones, and the speaker/audience roles.',
  input_schema: {
    type: 'object',
    properties: {
      contentType: {
        type: 'string',
        enum: ['pitch', 'guide', 'report', 'brief', 'proposal', 'educational', 'creative'],
      },
      suggestedCardCount: {
        type: 'number',
        description: 'Number of sections/cards, 3-15. Honour an explicit user count exactly.',
      },
      sections: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Specific noun phrase; no evaluative-adjective opens.' },
            purpose: { type: 'string', description: 'What this section achieves for the goal.' },
            suggestedLayout: {
              type: 'string',
              enum: ['single', 'split-left', 'split-right', 'three-col'],
            },
            template: {
              type: 'string',
              enum: [...BLOCK_TEMPLATES],
              description: 'The ONE block template best fitting this section. Required for every section.',
            },
            suggestedBlocks: {
              type: 'array',
              items: { type: 'string' },
              description: 'Legacy — leave empty; use template instead.',
            },
          },
          required: ['title', 'purpose', 'suggestedLayout'],
        },
      },
      audiences: {
        type: 'array',
        items: { type: 'string' },
        description: 'At least 2 specific audience descriptions.',
      },
      tones: {
        type: 'array',
        items: { type: 'string' },
        description: 'At least 2 vivid tone descriptions.',
      },
      speakerRole: { type: 'string', description: 'Who authors this deck.' },
      audienceRole: { type: 'string', description: 'Who reads this deck.' },
    },
    required: ['contentType', 'suggestedCardCount', 'sections', 'audiences', 'tones'],
  },
};

// One object branch per member of GeneratedBlockUnion (types.ts). `type` is a
// single-value enum acting as the discriminator. Exported so other LLM tools
// (e.g. the source-grounded slide generator) describe blocks identically —
// without it, a loose `items: { type: 'object' }` makes the OpenAI strict
// provider emit empty `{}` blocks that fail validation.
export const BLOCK_BRANCHES = [
  {
    type: 'object',
    properties: {
      type: { type: 'string', enum: ['heading'] },
      level: { type: 'number', enum: [1, 2, 3] },
      content: { type: 'string' },
    },
    required: ['type', 'level', 'content'],
  },
  {
    type: 'object',
    properties: {
      type: { type: 'string', enum: ['paragraph'] },
      content: { type: 'string' },
    },
    required: ['type', 'content'],
  },
  {
    type: 'object',
    properties: {
      type: { type: 'string', enum: ['smart-layout'] },
      variant: { type: 'string', enum: [...SMART_LAYOUT_VARIANTS] },
      cells: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            icon: { type: 'string' },
            heading: { type: 'string' },
            body: { type: 'string' },
            accentColor: { type: 'string' },
          },
          required: ['heading', 'body'],
        },
      },
    },
    required: ['type', 'variant', 'cells'],
  },
  {
    type: 'object',
    properties: {
      type: { type: 'string', enum: ['label-group'] },
      labels: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            style: { type: 'string', enum: ['filled', 'outline', 'filled-light', 'outline-light'] },
          },
          required: ['text', 'style'],
        },
      },
    },
    required: ['type', 'labels'],
  },
  {
    type: 'object',
    properties: {
      type: { type: 'string', enum: ['toggle'] },
      heading: { type: 'string' },
      content: { type: 'string' },
    },
    required: ['type', 'heading', 'content'],
  },
  {
    type: 'object',
    properties: {
      type: { type: 'string', enum: ['callout'] },
      icon: { type: 'string' },
      content: { type: 'string' },
    },
    required: ['type', 'content'],
  },
  {
    type: 'object',
    properties: {
      type: { type: 'string', enum: ['bullet-list'] },
      items: { type: 'array', items: { type: 'string' } },
    },
    required: ['type', 'items'],
  },
  {
    type: 'object',
    properties: {
      type: { type: 'string', enum: ['divider'] },
    },
    required: ['type'],
  },
  {
    type: 'object',
    properties: {
      type: { type: 'string', enum: ['button'] },
      text: { type: 'string' },
      url: { type: 'string' },
      style: { type: 'string', enum: ['primary', 'primary-light'] },
    },
    required: ['type', 'text', 'style'],
  },
];

/** Mirrors GeneratedCardSchema + ImageIntentSchema (types.ts). */
export const GENERATE_CARD_TOOL: Tool = {
  name: 'report_card',
  description:
    'Return one presentation card: its id, ordered content blocks (each a typed block), and an optional image intent.',
  input_schema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'The card id (use the id given in the prompt).' },
      blocks: {
        type: 'array',
        description: 'Ordered content blocks. Use varied block types — not all paragraphs.',
        items: { anyOf: BLOCK_BRANCHES },
      },
      imageIntent: {
        type: 'object',
        description: 'Whether this slide earns a generated image, what to depict, and where.',
        properties: {
          wanted: { type: 'boolean' },
          subject: { type: 'string', description: 'Visual concept; empty when wanted is false.' },
          style: { type: 'string', enum: [...IMAGE_STYLES] },
          placement: { type: 'string', enum: [...IMAGE_PLACEMENTS] },
        },
        required: ['wanted'],
      },
    },
    required: ['id', 'blocks'],
  },
};
