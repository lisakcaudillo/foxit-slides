'use client';

import type { ImageBlock as ImageBlockType } from '@/types/card-template';

export default function ImageBlock({ block }: { block: ImageBlockType }) {
  return (
    <div style={{ marginTop: '0.5rem', borderRadius: '8px', overflow: 'hidden' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={block.src}
        alt={block.alt || ''}
        style={{
          width: '100%',
          height: 'auto',
          objectFit: block.fit || 'cover',
          display: 'block',
        }}
      />
    </div>
  );
}
