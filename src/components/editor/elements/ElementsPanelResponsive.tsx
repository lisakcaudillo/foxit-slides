'use client';

import { useEffect, useState } from 'react';
import ElementsPanel from './ElementsPanel';
import ElementsPanelMobile from './ElementsPanelMobile';
import type { ElementsPanelCommonProps } from './types';

const MOBILE_BREAKPOINT = 768; // md

/**
 * Responsive wrapper — renders desktop ElementsPanel above 768px and the
 * mobile bottom-sheet variant below. Picks via window matchMedia.
 */
export default function ElementsPanelResponsive(props: ElementsPanelCommonProps) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  if (isMobile) return <ElementsPanelMobile {...props} />;
  return <ElementsPanel {...props} />;
}
