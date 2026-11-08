import type { IconName } from '@/components/icons/icon';

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { href: '/', label: 'Overview', icon: 'overview' },
  { href: '/transactions', label: 'Transactions', icon: 'transactions' },
  { href: '/calendar', label: 'Financial Calendar', icon: 'calendar' },
  { href: '/forecast', label: 'Forecast', icon: 'forecast' },
  { href: '/budgets', label: 'Budgets', icon: 'budgets' },
  { href: '/goals', label: 'Goals', icon: 'goals' },
  { href: '/accounts', label: 'Accounts', icon: 'accounts' },
  { href: '/insights', label: 'Insights', icon: 'insights' },
  { href: '/settings', label: 'Settings', icon: 'settings' },
];

export function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Bottom tab bar on phones — the same four destinations (and centre "add" action) as the Android
 * app, so both feel like one product. Everything else lives behind "More".
 */
export const MOBILE_TABS: readonly NavItem[] = [
  { href: '/', label: 'Overview', icon: 'overview' },
  { href: '/transactions', label: 'Transactions', icon: 'transactions' },
  { href: '/calendar', label: 'Calendar', icon: 'calendar' },
];
