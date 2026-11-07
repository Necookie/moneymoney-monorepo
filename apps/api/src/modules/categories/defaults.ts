import type { CategoryKind } from '@mm/types';

/** Starter categories created for every new user (real defaults, not demo data). */
export const DEFAULT_CATEGORIES: ReadonlyArray<{
  name: string;
  kind: CategoryKind;
  icon: string;
  color: string;
}> = [
  { name: 'Food & Dining', kind: 'expense', icon: 'utensils', color: '#F59E0B' },
  { name: 'Groceries', kind: 'expense', icon: 'cart', color: '#84CC16' },
  { name: 'Transport', kind: 'expense', icon: 'car', color: '#3B82F6' },
  { name: 'Bills & Utilities', kind: 'expense', icon: 'bolt', color: '#8B5CF6' },
  { name: 'Housing', kind: 'expense', icon: 'home', color: '#0EA5E9' },
  { name: 'Shopping', kind: 'expense', icon: 'bag', color: '#EC4899' },
  { name: 'Health', kind: 'expense', icon: 'heart', color: '#EF4444' },
  { name: 'Entertainment', kind: 'expense', icon: 'film', color: '#F97316' },
  { name: 'Education', kind: 'expense', icon: 'book', color: '#14B8A6' },
  { name: 'Electronics', kind: 'expense', icon: 'device', color: '#6366F1' },
  { name: 'Travel', kind: 'expense', icon: 'plane', color: '#06B6D4' },
  { name: 'Family & Gifts', kind: 'expense', icon: 'gift', color: '#D946EF' },
  { name: 'Other Expenses', kind: 'expense', icon: 'dots', color: '#6D6C6B' },
  { name: 'Salary', kind: 'income', icon: 'briefcase', color: '#16A34A' },
  { name: 'Freelance', kind: 'income', icon: 'laptop', color: '#22C55E' },
  { name: 'Other Income', kind: 'income', icon: 'coins', color: '#65A30D' },
];
