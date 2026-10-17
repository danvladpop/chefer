import { Router } from 'express';
import { env } from '../lib/env.js';
import { buildAppleAppSiteAssociation, buildAssetLinks } from '../lib/well-known/well-known.js';

// ─── /.well-known/* (WP-22) ──────────────────────────────────────────────────
// Plain Express routes (not tRPC). Both answer 200 with application/json and
// never redirect — Apple and Google reject redirected association files.
// Caddy routes exactly these two paths here; ACME challenges are untouched.

export const wellKnownRouter: Router = Router();

wellKnownRouter.get('/apple-app-site-association', (_req, res) => {
  res
    .status(200)
    .type('application/json')
    .set('Cache-Control', 'public, max-age=3600')
    .send(JSON.stringify(buildAppleAppSiteAssociation()));
});

wellKnownRouter.get('/assetlinks.json', (_req, res) => {
  res
    .status(200)
    .type('application/json')
    .set('Cache-Control', 'public, max-age=3600')
    .send(JSON.stringify(buildAssetLinks(env.ANDROID_CERT_SHA256)));
});
