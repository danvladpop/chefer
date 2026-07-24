import { NextResponse } from 'next/server';

// Liveness probe for the container healthcheck / reverse proxy.
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({ status: 'ok', service: 'web', timestamp: new Date().toISOString() });
}
