'use client';

import { usePathname } from 'next/navigation';

export default function MainContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Internal headless render targets: render children bare — no nav offset, no
  // background wash — so the captured slide sits at 0,0 with nothing over it.
  if (pathname.startsWith('/internal')) return <>{children}</>;

  const isEditorPage = pathname.startsWith('/editor') || pathname === '/workflows/new';

  // Non-editor routes use the 264px Sidebar (hidden below md, so no
  // margin offset on mobile). Editor routes use the slim 56px rail
  // which stays visible at all sizes.
  //
  // Editor routes get `h-screen` because the canvas + panels need a
  // locked 100vh viewport to manage their own scroll regions. Non-editor
  // routes use `min-h-screen` instead so the body becomes the natural
  // scroll context — nesting `overflow-y-auto` inside a `h-screen`
  // wrapper is a known iOS Safari trap (touch events on child elements
  // get eaten by the inner scroll container after the dynamic address
  // bar adjusts, so onClick / <a href> stop firing while native form
  // submission still works — i.e., the bug Lisa saw on iPad where only
  // the Create form-submit button responded).
  if (isEditorPage) {
    // Slides editor + the generate page have no fixed global rail, so they
    // render full-bleed (no 56px left offset — otherwise a white gutter shows
    // where the rail would be).
    const noRail = pathname.startsWith('/editor/slides') || pathname.startsWith('/editor/generate') || pathname.startsWith('/editor/asset');
    return <div className={`${noRail ? 'ml-0' : 'ml-[56px]'} h-screen`}>{children}</div>;
  }

  // Non-editor routes float the chrome (Sidebar) over a calm brand gradient.
  // The gradient is a fixed full-viewport layer behind the floating sidebar
  // and the content so the whole surface reads as one calm field.
  // Studio surfaces get the full D3 treatment: saturated bloom wash + a
  // floating translucent content panel (mirrors the floating ComposePanel
  // rail). The panel is the scroll owner — Studio pages render bare content
  // (no own h-screen/overflow). Everywhere else (Home etc.) keeps the calm
  // wash with content directly on it.
  if (pathname.startsWith('/studio')) {
    return (
      <>
        <div className="fixed inset-0 -z-10 bg-compose-wash" aria-hidden="true" />
        <div className="ml-0 md:ml-[264px] h-screen py-3 pr-0 md:pr-3">
          <div className="studio-content-panel h-full overflow-y-auto">{children}</div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="fixed inset-0 -z-10 bg-compose-wash" aria-hidden="true" />
      <div className="ml-0 md:ml-[264px] min-h-screen">{children}</div>
    </>
  );
}
