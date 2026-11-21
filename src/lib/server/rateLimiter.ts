/** Simple in-memory fixed-window rate limiter. Suitable for a single server instance. */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();
  private sweeper: NodeJS.Timeout;

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {
    this.sweeper = setInterval(() => this.sweep(), Math.max(windowMs, 30_000));
    this.sweeper.unref();
  }

  /** Returns true when the action is allowed. */
  consume(key: string): boolean {
    const now = Date.now();
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    entry.count += 1;
    return entry.count <= this.limit;
  }

  private sweep() {
    const now = Date.now();
    for (const [key, entry] of this.hits) {
      if (entry.resetAt <= now) this.hits.delete(key);
    }
  }
}
