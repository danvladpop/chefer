import { env } from '../../lib/env.js';

// ─── PostHog admin API (T-12.5) ────────────────────────────────────────────────
// Deletes a person's linked analytics events on account deletion. Optional:
// POSTHOG_PERSONAL_API_KEY / POSTHOG_PROJECT_ID absent = skip + log — most
// deployments (dev, and any account that never linked) never need this.
// EU Cloud admin/REST host (`eu.posthog.com`) — distinct from the capture
// host used by the web/mobile clients (`eu.i.posthog.com`).

const ADMIN_HOST = 'https://eu.posthog.com';

export interface IPostHogAdminClient {
  /**
   * Deletes every event PostHog has for this person (identified by the
   * distinct_id used when linking — the Chefer user id, see
   * lib/analytics.ts `identify()`). A no-op when the admin key/project id
   * are not configured.
   */
  deletePerson(distinctId: string): Promise<void>;
}

interface PostHogPerson {
  id: string;
}

class NoopPostHogAdminClient implements IPostHogAdminClient {
  deletePerson(distinctId: string): Promise<void> {
    console.log(
      `[posthog-admin] skipped person delete for ${distinctId} — POSTHOG_PERSONAL_API_KEY/POSTHOG_PROJECT_ID not configured`,
    );
    return Promise.resolve();
  }
}

class PostHogAdminClient implements IPostHogAdminClient {
  constructor(
    private readonly apiKey: string,
    private readonly projectId: string,
  ) {}

  async deletePerson(distinctId: string): Promise<void> {
    try {
      const person = await this.findPersonByDistinctId(distinctId);
      if (!person) {
        console.log(`[posthog-admin] no PostHog person found for ${distinctId} — nothing to do`);
        return;
      }
      const res = await fetch(
        `${ADMIN_HOST}/api/projects/${this.projectId}/persons/${person.id}/`,
        { method: 'DELETE', headers: this.authHeaders() },
      );
      if (!res.ok && res.status !== 404) {
        throw new Error(`PostHog delete-person failed: ${res.status} ${await res.text()}`);
      }
      console.log(`[posthog-admin] deleted PostHog person ${person.id} for ${distinctId}`);
    } catch (err) {
      // Best-effort: never blocks the account deletion itself.
      console.error(`[posthog-admin] failed to delete person for ${distinctId}:`, err);
    }
  }

  private async findPersonByDistinctId(distinctId: string): Promise<PostHogPerson | null> {
    const url = `${ADMIN_HOST}/api/projects/${this.projectId}/persons/?distinct_id=${encodeURIComponent(distinctId)}`;
    const res = await fetch(url, { headers: this.authHeaders() });
    if (!res.ok) {
      throw new Error(`PostHog person lookup failed: ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as { results?: PostHogPerson[] };
    return body.results?.[0] ?? null;
  }

  private authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.apiKey}` };
  }
}

export const posthogAdmin: IPostHogAdminClient =
  env.POSTHOG_PERSONAL_API_KEY && env.POSTHOG_PROJECT_ID
    ? new PostHogAdminClient(env.POSTHOG_PERSONAL_API_KEY, env.POSTHOG_PROJECT_ID)
    : new NoopPostHogAdminClient();
