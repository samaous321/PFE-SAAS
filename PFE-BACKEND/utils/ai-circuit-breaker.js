class AICircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || Number(process.env.AI_CIRCUIT_BREAKER_FAILURES) || 3;
    this.timeout = options.timeout || Number(process.env.AI_CIRCUIT_BREAKER_TIMEOUT) || 60000; // 60s
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.successCount = 0;
  }

  recordSuccess() {
    this.failureCount = 0;
    this.lastFailureTime = null;

    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= 2) {
        this.state = 'CLOSED';
        this.successCount = 0;
        console.log('[AI Circuit] ✅ Circuit CLOSED - Ollama recovered');
      }
    }
  }

  recordFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      console.error(`[AI Circuit] 🚨 Circuit OPEN - Failed ${this.failureCount} times. Retry after ${this.timeout}ms`);
    }
  }

  canExecute() {
    if (this.state === 'CLOSED') return true;
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'HALF_OPEN';
        this.successCount = 0;
        console.log('[AI Circuit] 🔄 HALF_OPEN - Testing Ollama');
        return true;
      }
      return false;
    }
    // HALF_OPEN: allow one call to test
    return true;
  }

  getStatus() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      timeout: this.timeout
    };
  }

  reset() {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.successCount = 0;
    console.log('[AI Circuit] 🔁 Circuit RESET to CLOSED');
  }
}

export default new AICircuitBreaker();
