import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Client-generated UUID for idempotent creates (transactions, mark-paid). */
export function newId(): string {
  return crypto.randomUUID();
}
