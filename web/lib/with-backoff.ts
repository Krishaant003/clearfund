export interface BackoffOptions {
  retries?: number;
  baseDelayMs?: number;
}

function extractStatusCode(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const candidate = error as { statusCode?: number; status?: number };
  return candidate.statusCode ?? candidate.status;
}

function extractRetryAfterMs(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const response = (error as { response?: { headers?: { get: (name: string) => string | null } } }).response;
  const value = response?.headers?.get("retry-after");
  if (!value) return undefined;
  const seconds = Number(value);
  return Number.isFinite(seconds) ? seconds * 1000 : undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withBackoff<T>(fn: () => Promise<T>, options: BackoffOptions = {}): Promise<T> {
  const retries = options.retries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 1000;

  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const status = extractStatusCode(error);
      if (status !== 429 || attempt >= retries) throw error;
      const delayMs = extractRetryAfterMs(error) ?? baseDelayMs * 2 ** attempt;
      await sleep(delayMs);
    }
  }
}
