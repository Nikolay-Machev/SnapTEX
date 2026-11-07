export function withClient<T>(client: string, next: () => T): T;
export function clientIdentity(): string | undefined;
export class WindowLimiter {
  constructor(limit: number, windowMs: number, maxKeys?: number);
  events: Map<string, number[]>;
  allow(key: string, now?: number): number;
}
export function admission(): { status: number; message: string; retryAfter: number } | undefined;
export function paidAdmission(): number;
