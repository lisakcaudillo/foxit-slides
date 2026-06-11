import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Template Workflow Manager',
  description: 'AI-Powered Template Creation with Reusable Workflows',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
