import type { ColorValue } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// One icon component for the revamp (plan: "Shape, depth and icons"). Screens
// name WHAT the icon means; this file decides how it is drawn. Today every
// name maps to an Ionicons glyph; binary 1.1 links expo-symbols and the iOS
// branch switches to SF Symbols (Material Symbols on Android) here, without
// touching a screen.

const GLYPHS = {
  today: 'sunny-outline',
  todayActive: 'sunny',
  plan: 'calendar-outline',
  planActive: 'calendar',
  shop: 'cart-outline',
  shopActive: 'cart',
  train: 'barbell-outline',
  trainActive: 'barbell',
  you: 'person-circle-outline',
  youActive: 'person-circle',
  add: 'add',
  chef: 'sparkles-outline',
  progress: 'stats-chart-outline',
  weeks: 'repeat-outline',
  household: 'home-outline',
  following: 'people-outline',
  settings: 'settings-outline',
  gymSettings: 'options-outline',
  feedback: 'chatbox-ellipses-outline',
  help: 'help-circle-outline',
  legal: 'document-text-outline',
  signOut: 'log-out-outline',
  routine: 'list-outline',
  history: 'time-outline',
  library: 'library-outline',
  stats: 'trending-up-outline',
  play: 'play',
  chevronRight: 'chevron-forward',
  chevronBack: 'chevron-back',
  close: 'close',
  camera: 'camera-outline',
  copy: 'copy-outline',
  flame: 'flame-outline',
  scale: 'scale-outline',
  search: 'search',
  recipes: 'book-outline',
  timer: 'timer-outline',
  // 10 Oct redesign
  checkmark: 'checkmark',
  checkmarkCircle: 'checkmark-circle',
  swap: 'swap-horizontal-outline',
  skip: 'play-skip-forward-outline',
  cook: 'restaurant-outline',
  more: 'ellipsis-horizontal',
  share: 'share-outline',
  refresh: 'refresh-outline',
  rebalance: 'color-wand-outline',
  info: 'information-circle-outline',
  activity: 'walk-outline',
  edit: 'create-outline',
  heart: 'heart',
  heartOutline: 'heart-outline',
  link: 'link-outline',
  shield: 'shield-checkmark-outline',
  notifications: 'notifications-outline',
  account: 'person-circle-outline',
  meals: 'restaurant-outline',
  trophy: 'trophy-outline',
  star: 'star-outline',
  trendDown: 'trending-down-outline',
  chevronDown: 'chevron-down',
  chevronUp: 'chevron-up',
  arrowUp: 'arrow-up',
  remove: 'remove',
  trash: 'trash-outline',
  calendar: 'calendar-outline',
  cart: 'cart-outline',
  list: 'list-outline',
  time: 'time-outline',
  barbell: 'barbell-outline',
  pause: 'pause-outline',
  images: 'images-outline',
} as const satisfies Record<string, keyof typeof Ionicons.glyphMap>;

export type IconName = keyof typeof GLYPHS;

export interface IconProps {
  name: IconName;
  size?: number;
  color: ColorValue;
}

/** A decorative glyph: hidden from screen readers (its control carries the label). */
export function Icon({ name, size = 22, color }: IconProps) {
  return (
    <Ionicons
      name={GLYPHS[name]}
      size={size}
      color={color}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}
