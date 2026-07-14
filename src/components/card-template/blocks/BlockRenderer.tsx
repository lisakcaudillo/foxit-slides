'use client';

import type { CardBlock } from '@/types/card-template';
import HeadingBlock from './HeadingBlock';
import ParagraphBlock from './ParagraphBlock';
import SmartLayoutBlock from './SmartLayoutBlock';
import LabelGroupBlock from './LabelGroupBlock';
import ToggleBlock from './ToggleBlock';
import CalloutBlock from './CalloutBlock';
import BulletListBlock from './BulletListBlock';
import DividerBlock from './DividerBlock';
import ButtonBlock from './ButtonBlock';
import ImageBlock from './ImageBlock';

export default function BlockRenderer({
  block,
  invertColors,
}: {
  block: CardBlock;
  invertColors?: boolean;
}) {
  switch (block.type) {
    case 'heading':
      return <HeadingBlock block={block} invertColors={invertColors} />;
    case 'paragraph':
      return <ParagraphBlock block={block} invertColors={invertColors} />;
    case 'smart-layout':
      return <SmartLayoutBlock block={block} invertColors={invertColors} />;
    case 'label-group':
      return <LabelGroupBlock block={block} invertColors={invertColors} />;
    case 'toggle':
      return <ToggleBlock block={block} invertColors={invertColors} />;
    case 'callout':
      return <CalloutBlock block={block} invertColors={invertColors} />;
    case 'bullet-list':
      return <BulletListBlock block={block} invertColors={invertColors} />;
    case 'divider':
      return <DividerBlock invertColors={invertColors} />;
    case 'button':
      return <ButtonBlock block={block} />;
    case 'image':
      return <ImageBlock block={block} />;
    case 'grid-layout':
      return null; // Grid-layout renderer deferred — not used in Project Brief
    default:
      return null;
  }
}
