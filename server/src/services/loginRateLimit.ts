type AttemptWindow = { failures: number; resetAt: number };

export class LoginAttemptLimiter {
  private readonly attempts = new Map<string, AttemptWindow>();

  constructor(
    private readonly maxFailures = 5,
    private readonly windowMs = 15 * 60 * 1000,
  ) {}

  check(key: string, now = Date.now()) {
    const window = this.attempts.get(key);
    if (!window || window.resetAt <= now) {
      this.attempts.delete(key);
      return { blocked: false, retryAfterSeconds: 0 };
    }
    if (window.failures < this.maxFailures) return { blocked: false, retryAfterSeconds: 0 };
    return { blocked: true, retryAfterSeconds: Math.max(1, Math.ceil((window.resetAt - now) / 1000)) };
  }

  recordFailure(key: string, now = Date.now()) {
    const current = this.attempts.get(key);
    if (!current || current.resetAt <= now) {
      this.attempts.set(key, { failures: 1, resetAt: now + this.windowMs });
    } else {
      current.failures += 1;
    }
  }

  clear(key: string) {
    this.attempts.delete(key);
  }
}

export const loginAttemptLimiter = new LoginAttemptLimiter();