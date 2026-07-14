/**
 * Icon-name → Iconify id mapping + resolver. Pure data + a pure function, with
 * NO 'use client' directive, so it is safe to import from BOTH the client
 * PictographicIcon component AND server code (e.g. the pptx exporter's
 * render-to-SVG path). Extracted from PictographicIcon.tsx because calling a
 * function exported from a 'use client' module on the server throws
 * ("resolveIconId is on the client").
 *
 * Google Material Symbols (Foxit marketing standard) via Iconify CDN.
 */
export const ICON_MAP: Record<string, string> = {
  // Travel & Places
  'map-pin': 'material-symbols:location-on',
  location: 'material-symbols:location-on',
  pin: 'material-symbols:pin-drop',
  map: 'material-symbols:map',
  compass: 'material-symbols:explore',
  building: 'material-symbols:apartment',
  globe: 'material-symbols:public',
  mountain: 'material-symbols:landscape',
  waves: 'material-symbols:waves',
  bridge: 'material-symbols:holiday-village',
  park: 'material-symbols:park',
  beach: 'material-symbols:beach-access',
  attraction: 'material-symbols:attractions',

  // Food & Drink
  food: 'material-symbols:restaurant',
  utensils: 'material-symbols:restaurant',
  restaurant: 'material-symbols:restaurant',
  dining: 'material-symbols:dinner-dining',
  coffee: 'material-symbols:coffee',
  beer: 'material-symbols:sports-bar',
  'local-dining': 'material-symbols:local-dining',

  // Entertainment
  music: 'material-symbols:music-note',
  nightlife: 'material-symbols:nightlife',
  camera: 'material-symbols:photo-camera',
  photo: 'material-symbols:image',
  ticket: 'material-symbols:confirmation-number',
  party: 'material-symbols:celebration',
  gamepad: 'material-symbols:stadia-controller',
  theater: 'material-symbols:theaters',
  'local-activity': 'material-symbols:local-activity',

  // Transport
  bus: 'material-symbols:directions-bus',
  car: 'material-symbols:directions-car',
  plane: 'material-symbols:flight',
  train: 'material-symbols:train',
  bicycle: 'material-symbols:pedal-bike',
  walking: 'material-symbols:directions-walk',
  transport: 'material-symbols:commute',

  // Money & Shopping
  dollar: 'material-symbols:attach-money',
  money: 'material-symbols:payments',
  wallet: 'material-symbols:account-balance-wallet',
  'piggy-bank': 'material-symbols:savings',
  budget: 'material-symbols:savings',
  savings: 'material-symbols:savings',
  discount: 'material-symbols:discount',
  shopping: 'material-symbols:shopping-bag',
  'credit-card': 'material-symbols:credit-card',

  // People & Social
  users: 'material-symbols:group',
  heart: 'material-symbols:favorite',
  star: 'material-symbols:star',
  'thumbs-up': 'material-symbols:thumb-up',
  handshake: 'material-symbols:handshake',
  family: 'material-symbols:family-restroom',

  // Business
  target: 'material-symbols:track-changes',
  briefcase: 'material-symbols:work',
  rocket: 'material-symbols:rocket-launch',
  trophy: 'material-symbols:emoji-events',
  award: 'material-symbols:military-tech',
  chart: 'material-symbols:trending-up',
  'trending-up': 'material-symbols:trending-up',

  // Education
  'graduation-cap': 'material-symbols:school',
  school: 'material-symbols:school',
  book: 'material-symbols:menu-book',
  lightbulb: 'material-symbols:lightbulb',
  idea: 'material-symbols:lightbulb',
  science: 'material-symbols:science',

  // Status & Info
  warning: 'material-symbols:warning',
  alert: 'material-symbols:error',
  info: 'material-symbols:info',
  check: 'material-symbols:check-circle',
  clock: 'material-symbols:schedule',
  calendar: 'material-symbols:calendar-today',
  flag: 'material-symbols:flag',
  shield: 'material-symbols:shield',
  lock: 'material-symbols:lock',
  sparkles: 'material-symbols:auto-awesome',
  zap: 'material-symbols:bolt',
  verified: 'material-symbols:verified',

  // Tools / UI / documents (used by structure-fill icon-badge layouts)
  file: 'material-symbols:description',
  document: 'material-symbols:description',
  download: 'material-symbols:download',
  upload: 'material-symbols:upload',
  settings: 'material-symbols:settings',
  layers: 'material-symbols:layers',
  edit: 'material-symbols:edit',
  gift: 'material-symbols:card-giftcard',

  // Weather/Nature
  sun: 'material-symbols:clear-day',
  sunrise: 'material-symbols:wb-twilight',
  sunset: 'material-symbols:wb-twilight',
  moon: 'material-symbols:dark-mode',
  tree: 'material-symbols:forest',

  // Communication
  phone: 'material-symbols:call',
  mail: 'material-symbols:mail',
  message: 'material-symbols:chat',
  megaphone: 'material-symbols:campaign',
};

export function resolveIconId(name: string): string {
  // If already in set:icon format, use directly
  if (name.includes(':')) return name;
  // Look up in our map
  return ICON_MAP[name.toLowerCase()] || `material-symbols:${name}`;
}
