import { clsx, type ClassValue } from './clsx-shim';

/** Tiny classNames helper (kept dependency-free for offline reliability). */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}