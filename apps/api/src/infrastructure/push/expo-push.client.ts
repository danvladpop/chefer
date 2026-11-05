import { z } from 'zod';
import { PUSH_RECEIPT_BATCH, PUSH_SEND_BATCH, type PushData } from '@chefer/types';
import { env } from '../../lib/env.js';

// ─── Expo push API (docs/prd-2026-10/trainer-mode.md §7.2 "Infrastructure"; M4) ──
// Plain fetch (no expo-server-sdk): POST /push/send with ≤ 100 messages and
// POST /push/getReceipts with ≤ 1000 ticket ids. Off unless
// EXPO_PUSH_ENABLED=true — dev and CI get the Noop client, which "sends"
// nothing (every message gets an id-less ok ticket, so rows are marked sent
// and never pile up). EXPO_ACCESS_TOKEN (optional) is sent as a bearer token
// when the Expo project has "enhanced push security" on.
// Tokens never appear in an error or a log line: errors carry Expo's code only.

const EXPO_PUSH_HOST = 'https://exp.host/--/api/v2/push';
const REQUEST_TIMEOUT_MS = 15_000;

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data: PushData;
  sound: 'default';
  priority: 'high';
  /** Android: the channel the app creates at startup. */
  channelId: 'default';
}

const errorDetailsSchema = z.object({ error: z.string().optional() }).passthrough().optional();

const ticketSchema = z.union([
  z.object({ status: z.literal('ok'), id: z.string().optional() }),
  z.object({
    status: z.literal('error'),
    message: z.string().optional(),
    details: errorDetailsSchema,
  }),
]);
export type ExpoPushTicket = z.infer<typeof ticketSchema>;

const receiptSchema = z.union([
  z.object({ status: z.literal('ok') }),
  z.object({
    status: z.literal('error'),
    message: z.string().optional(),
    details: errorDetailsSchema,
  }),
]);
export type ExpoPushReceipt = z.infer<typeof receiptSchema>;

const sendResponseSchema = z.object({ data: z.array(ticketSchema) });
const receiptsResponseSchema = z.object({ data: z.record(receiptSchema) });
const errorsResponseSchema = z.object({
  errors: z.array(z.object({ code: z.string().optional() }).passthrough()),
});

/** A whole request failed (network, HTTP status, or an Expo request-level error code). */
export class ExpoPushError extends Error {
  constructor(readonly code: string) {
    super(`Expo push request failed: ${code}`);
    this.name = 'ExpoPushError';
  }
}

export interface IExpoPushClient {
  /** ≤ PUSH_SEND_BATCH messages; one ticket per message, in order. */
  send(messages: readonly ExpoPushMessage[]): Promise<ExpoPushTicket[]>;
  /** ≤ PUSH_RECEIPT_BATCH ticket ids; ids without a receipt yet are absent. */
  getReceipts(ids: readonly string[]): Promise<Record<string, ExpoPushReceipt>>;
}

/** EXPO_PUSH_ENABLED is not true: nothing leaves the server. */
export class NoopExpoPushClient implements IExpoPushClient {
  send(messages: readonly ExpoPushMessage[]): Promise<ExpoPushTicket[]> {
    return Promise.resolve(messages.map(() => ({ status: 'ok' as const })));
  }

  getReceipts(): Promise<Record<string, ExpoPushReceipt>> {
    return Promise.resolve({});
  }
}

export class FetchExpoPushClient implements IExpoPushClient {
  constructor(
    private readonly accessToken: string | undefined,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(messages: readonly ExpoPushMessage[]): Promise<ExpoPushTicket[]> {
    if (messages.length === 0) return [];
    if (messages.length > PUSH_SEND_BATCH) throw new ExpoPushError('BATCH_TOO_LARGE');
    const body = await this.post('/send', messages);
    const parsed = sendResponseSchema.safeParse(body);
    if (!parsed.success || parsed.data.data.length !== messages.length) {
      throw new ExpoPushError('BAD_RESPONSE');
    }
    return parsed.data.data;
  }

  async getReceipts(ids: readonly string[]): Promise<Record<string, ExpoPushReceipt>> {
    if (ids.length === 0) return {};
    if (ids.length > PUSH_RECEIPT_BATCH) throw new ExpoPushError('BATCH_TOO_LARGE');
    const body = await this.post('/getReceipts', { ids });
    const parsed = receiptsResponseSchema.safeParse(body);
    if (!parsed.success) throw new ExpoPushError('BAD_RESPONSE');
    return parsed.data.data;
  }

  private async post(path: string, payload: unknown): Promise<unknown> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${EXPO_PUSH_HOST}${path}`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
          ...(this.accessToken && { Authorization: `Bearer ${this.accessToken}` }),
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      throw new ExpoPushError(err instanceof Error ? err.name : 'NETWORK');
    }
    const body: unknown = await res.json().catch(() => null);
    const errors = errorsResponseSchema.safeParse(body);
    if (errors.success && errors.data.errors.length > 0) {
      throw new ExpoPushError(errors.data.errors[0]?.code ?? `HTTP_${res.status}`);
    }
    if (!res.ok) throw new ExpoPushError(`HTTP_${res.status}`);
    return body;
  }
}

export function createExpoPushClient(config: {
  enabled: boolean;
  accessToken?: string | undefined;
}): IExpoPushClient {
  return config.enabled ? new FetchExpoPushClient(config.accessToken) : new NoopExpoPushClient();
}

export const expoPushClient: IExpoPushClient = createExpoPushClient({
  enabled: env.EXPO_PUSH_ENABLED,
  accessToken: env.EXPO_ACCESS_TOKEN,
});
