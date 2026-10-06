import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildAppleAppSiteAssociation, buildAssetLinks } from '../lib/well-known/well-known.js';
import { wellKnownRouter } from './well-known.router.js';

const fingerprints = vi.hoisted(() => ({ value: [] as string[] }));
vi.mock('../lib/env.js', () => ({
  env: {
    get ANDROID_CERT_SHA256() {
      return fingerprints.value;
    },
  },
}));

let server: ReturnType<express.Express['listen']>;
let base = '';

beforeAll(async () => {
  const app = express();
  app.use('/.well-known', wellKnownRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
  server.close();
});

describe('/.well-known association files', () => {
  it('serves the Apple webcredentials association as JSON, with no redirect', async () => {
    const res = await fetch(`${base}/.well-known/apple-app-site-association`, {
      redirect: 'manual',
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual({
      webcredentials: { apps: ['45TS85YK89.com.popdan.chefer'] },
    });
  });

  it('serves an empty assetlinks list until fingerprints are configured', async () => {
    fingerprints.value = [];
    const res = await fetch(`${base}/.well-known/assetlinks.json`, { redirect: 'manual' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual([]);
  });

  it('serves the get_login_creds statement for the production package with the env fingerprints', async () => {
    fingerprints.value = ['AA:BB', 'CC:DD'];
    const res = await fetch(`${base}/.well-known/assetlinks.json`);
    expect(await res.json()).toEqual([
      {
        relation: ['delegate_permission/common.get_login_creds'],
        target: {
          namespace: 'android_app',
          package_name: 'dev.chefer.app',
          sha256_cert_fingerprints: ['AA:BB', 'CC:DD'],
        },
      },
    ]);
  });

  it('builders are pure', () => {
    expect(buildAssetLinks([])).toEqual([]);
    expect(buildAppleAppSiteAssociation('T', 'b.c')).toEqual({
      webcredentials: { apps: ['T.b.c'] },
    });
  });
});
