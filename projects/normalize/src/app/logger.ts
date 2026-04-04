import { environment } from '../environments/environment';

export function debugLog(...args: unknown[]): void {
  if (!environment.debug) {
    return;
  }
  // Centralized debug logging toggle.
  console.log(...args);
}
