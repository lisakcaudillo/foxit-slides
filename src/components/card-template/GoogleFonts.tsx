'use client';

/**
 * Loads Google Fonts used by card template themes.
 * Renders a <link> tag — only loads fonts that are actually needed.
 * All Google Fonts are free (Open Font License / Apache 2.0).
 */

const FONT_URLS: Record<string, string> = {
  'Inter': 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap',
  'Poppins': 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap',
  'Open Sans': 'https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600;700;800&display=swap',
  'Montserrat': 'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap',
  'Work Sans': 'https://fonts.googleapis.com/css2?family=Work+Sans:wght@400;500;600;700;800&display=swap',
  'Roboto': 'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;600;700;800;900&display=swap',
  'Lato': 'https://fonts.googleapis.com/css2?family=Lato:wght@400;700;900&display=swap',
  'Source Sans 3': 'https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;500;600;700;800&display=swap',
  'Manrope': 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap',
  'DM Sans': 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap',
  'Space Grotesk': 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap',
  'Plus Jakarta Sans': 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap',
  // Display / editorial serifs — title-slide cover treatments (cover-forms.tsx).
  'Source Serif 4': 'https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,500;0,8..60,600;0,8..60,700;1,8..60,400;1,8..60,500&display=swap',
  'Fraunces': 'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,400;1,9..144,600&display=swap',
  'Playfair Display': 'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400;1,600&display=swap',
  'Sora': 'https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&display=swap',
  'Georgia': '', // System font, no need to load
};

export default function GoogleFonts({ fonts }: { fonts: string[] }) {
  const urls = fonts
    .map(f => FONT_URLS[f])
    .filter((url): url is string => !!url && url.length > 0);

  if (urls.length === 0) return null;

  return (
    <>
      {urls.map(url => (
        <link key={url} rel="stylesheet" href={url} />
      ))}
    </>
  );
}
