// Deep imports keep the bundle to the icons actually used (the package index re-exports 900+).
import ArrowDownLeft from 'runeicons-react-native/arrow-down-left';
import ArrowLeft from 'runeicons-react-native/arrow-left';
import ArrowLeftRight from 'runeicons-react-native/arrow-left-right';
import ArrowUpRight from 'runeicons-react-native/arrow-up-right';
import Calendar from 'runeicons-react-native/calendar';
import ChartLine from 'runeicons-react-native/chart-line';
import ChartPie from 'runeicons-react-native/chart-pie';
import Check from 'runeicons-react-native/check';
import ChevronLeft from 'runeicons-react-native/chevron-left';
import ChevronRight from 'runeicons-react-native/chevron-right';
import CircleAlert from 'runeicons-react-native/circle-alert';
import CircleCheck from 'runeicons-react-native/circle-check';
import Clock from 'runeicons-react-native/clock';
import CloudUpload from 'runeicons-react-native/cloud-upload';
import CreditCard from 'runeicons-react-native/credit-card';
import Flag from 'runeicons-react-native/flag';
import House from 'runeicons-react-native/house';
import Info from 'runeicons-react-native/info';
import ListFilter from 'runeicons-react-native/list-filter';
import Lock from 'runeicons-react-native/lock';
import LogOut from 'runeicons-react-native/log-out';
import Menu from 'runeicons-react-native/menu';
import Minus from 'runeicons-react-native/minus';
import Pencil from 'runeicons-react-native/pencil';
import Plus from 'runeicons-react-native/plus';
import Receipt from 'runeicons-react-native/receipt';
import RefreshCw from 'runeicons-react-native/refresh-cw';
import Repeat from 'runeicons-react-native/repeat';
import Search from 'runeicons-react-native/search';
import Settings from 'runeicons-react-native/settings';
import ShieldCheck from 'runeicons-react-native/shield-check';
import SkipForward from 'runeicons-react-native/skip-forward';
import Sparkles from 'runeicons-react-native/sparkles';
import Trash2 from 'runeicons-react-native/trash-2';
import TrendingUp from 'runeicons-react-native/trending-up';
import TriangleAlert from 'runeicons-react-native/triangle-alert';
import Wallet from 'runeicons-react-native/wallet';
import WifiLow from 'runeicons-react-native/wifi-low';
import X from 'runeicons-react-native/x';
import { colors } from '@/lib/theme';

const ICONS = {
  'arrow-down-left': ArrowDownLeft,
  'arrow-left': ArrowLeft,
  'arrow-left-right': ArrowLeftRight,
  'arrow-up-right': ArrowUpRight,
  calendar: Calendar,
  'chart-line': ChartLine,
  'chart-pie': ChartPie,
  check: Check,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  'circle-alert': CircleAlert,
  'circle-check': CircleCheck,
  clock: Clock,
  'cloud-upload': CloudUpload,
  'credit-card': CreditCard,
  flag: Flag,
  house: House,
  info: Info,
  'list-filter': ListFilter,
  lock: Lock,
  'log-out': LogOut,
  menu: Menu,
  minus: Minus,
  pencil: Pencil,
  plus: Plus,
  receipt: Receipt,
  refresh: RefreshCw,
  repeat: Repeat,
  search: Search,
  settings: Settings,
  'shield-check': ShieldCheck,
  'skip-forward': SkipForward,
  sparkles: Sparkles,
  trash: Trash2,
  'trending-up': TrendingUp,
  'triangle-alert': TriangleAlert,
  wallet: Wallet,
  offline: WifiLow,
  x: X,
} as const;

export type IconName = keyof typeof ICONS;

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

/** The single place the app touches the icon set (swap Rune Icons here). */
export function Icon({ name, size = 22, color = colors.ink, strokeWidth = 1.75 }: IconProps) {
  const Component = ICONS[name];
  return <Component size={size} color={color} strokeWidth={strokeWidth} />;
}
