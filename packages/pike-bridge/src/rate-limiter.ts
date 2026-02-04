/**
 * Rate Limiter
 *
 * Token bucket rate limiter for throttling Pike subprocess requests.
 * Prevents resource exhaustion and ensures fair usage.
 */

export class RateLimiter {
    private tokens: number;
    private maxTokens: number;
    private refillRate: number;
    private lastRefill: number;

    constructor(maxTokens: number = 100, refillRate: number = 10) {
        this.maxTokens = maxTokens;
        this.tokens = maxTokens;
        this.refillRate = refillRate; // tokens per second
        this.lastRefill = Date.now();
    }

    tryAcquire(): boolean {
        this.refill();
        if (this.tokens > 0) {
            this.tokens--;
            return true;
        }
        return false;
    }

    private refill(): void {
        const now = Date.now();
        const elapsed = (now - this.lastRefill) / 1000;
        this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
        this.lastRefill = now;
    }
}
