'use client';

import type { CardTemplate } from '@/types/card-template';
import TemplateThemeProvider from './TemplateThemeProvider';
import CardRenderer from './CardRenderer';

export default function TemplateView({ template }: { template: CardTemplate }) {
  return (
    <TemplateThemeProvider theme={template.theme}>
      <div
        style={{
          background: template.theme.pageBg,
          minHeight: '100vh',
          padding: '2.5rem 1.5rem',
          overflowY: 'auto',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '2rem',
          }}
        >
          {template.cards.map((card) => (
            <CardRenderer key={card.id} card={card} />
          ))}
        </div>
      </div>
    </TemplateThemeProvider>
  );
}
