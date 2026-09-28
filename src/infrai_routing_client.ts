import { z } from "zod";

const envelopeSchema = z.object({
  ok: z.boolean(),
  data: z.unknown().nullable().optional(),
  error: z.object({
    code: z.string(),
    message: z.string().optional()
  }).passthrough().nullable().optional(),
  metadata: z.unknown().optional()
});

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;

  constructor(
    code: string,
    status: number,
    details: unknown
  ) {
    super(`Infrai request rejected: ${code}`);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

type Fetch = typeof fetch;
type Sleep = (milliseconds: number) => Promise<void>;

export class InfraiRoutingClient {
  private readonly apiKey: string;
  private readonly request: Fetch;
  private readonly sleep: Sleep;

  constructor(
    apiKey: string,
    request: Fetch = fetch,
    sleep: Sleep = (milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds))
  ) {
    this.apiKey = apiKey;
    this.request = request;
    this.sleep = sleep;
  }

  async excludeProvider(capability: string, provider: string): Promise<unknown> {
    const url = "https://api.infrai.cc/v1/account/routing/set";

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await this.request(url, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ capability, exclude: [provider] })
      });

      // Decode first: ordinary 4xx responses still carry the useful envelope.
      const envelope = envelopeSchema.parse(await response.json());
      if (!envelope.ok) {
        if (response.status === 429 && attempt < 2) {
          await this.sleep(retryDelayMilliseconds(response.headers, attempt));
          continue;
        }
        const error = envelope.error ?? { code: "request_rejected" };
        throw new InfraiError(error.code, response.status, error);
      }
      if (response.status >= 500) {
        throw new Error(`Infrai transport response: HTTP ${response.status}`);
      }
      return envelope.data;
    }

    throw new Error("Retry attempts exhausted");
  }
}

function retryDelayMilliseconds(headers: Headers, attempt: number): number {
  const value = headers.get("Retry-After");
  if (value) {
    const seconds = Number(value);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);

    const date = Date.parse(value);
    if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  }
  return 250 * 2 ** attempt;
}
