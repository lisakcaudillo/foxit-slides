'use client';

import { type ReactNode, useEffect } from 'react';
import { ToastProvider } from '@/components/Toast';
import { ThemeProvider } from '@/lib/theme/ThemeProvider';
import { initFoxitSDK } from '@/lib/foxit';

export default function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    initFoxitSDK();
  }, []);

  return (
    <ThemeProvider>
      <ToastProvider>{children}</ToastProvider>
    </ThemeProvider>
  );
}
