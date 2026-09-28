export interface BackoffOptions {
  retries?: number;
  baseDelayMs?: number;
}

function extractStatusCode(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const candidate = error as { statusCode?: number; status?: number };
  return candidate.statusCode ?? candidate.status;
}

type HeadersLike = { get: (name: string) => string | null } | Record<string, string>;

function readHeader(headers: HeadersLike, name: string): string | null | undefined {
  return typeof (headers as { get?: unknown }).get === "function"
    ? (headers as { get: (name: string) => string | null }).get(name)
    : (headers as Record<string, string>)[name] ?? (headers as Record<string, string>)[name.toLowerCase()];
}

function extractRetryAfterMs(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const response = (error as { response?: { headers?: HeadersLike } }).response;
  if (!response?.headers) return undefined;
  const value = readHeader(response.headers, "retry-after");
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
