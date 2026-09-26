import { writeFileSync } from 'node:fs';
import { ChainAIService } from '../failover.js';
import { createProvider, type ProviderConfig } from '../providers.js';
import {
  AI_PROVIDER_NAMES,
  AI_WORKLOADS,
  isAiWorkload,
  parseChain,
  type AiWorkload,
  type EvalProviderName,
} from '../routing.js';
import type { IAIService } from '../types.js';
import { loadEvalProviderConfig } from './env.js';
import { GOLDEN_DIR, loadGoldenSet } from './golden.js';
import { EVAL_WORKLOADS, runEval } from './runner.js';
import {
  DEFAULT_GATE,
  formatSummaryTable,
  type CaseResult,
  type EvalSummary,
  type GateOptions,
} from './scorer.js';

// ─── pnpm ai:eval ─────────────────────────────────────────────────────────────
//   pnpm ai:eval --route=<workload|a,b|all> --provider=<chain> [--limit=N]
//                [--concurrency=N] [--delay-ms=N] [--min-schema=PCT]
//                [--out=results.json] [--golden=<dir>] [--verbose]
//
//   --route        mealPlan, swap, cheferize, importText, vision, review, prices,
//                  shopping (chat is not evaluated offline: its tools write data)
//   --provider     a chain like the AI_ROUTE_* values: gemini, groq, groq>gemini,
//                  or mock (fixtures, no keys, no cost)
//   --limit        at most N cases per workload (cost control on live providers)
//   --concurrency  cases in flight at once (default 1)
//   --delay-ms     pause between cases (default 0; ~5000 on Groq's free tier)
//   --min-schema   gate: minimum schema-valid % per workload (default 95)
//   --out          write the JSON report to a file instead of stdout
//
// 429s are waited out (Retry-After / "try again in Xs", up to 60 s) and the
// case retried, twice at most. Prints a table, then the JSON report. Exit code
// 1 when a gate fails (any errored case, any allergen violation, or
// schema-valid below --min-schema), 2 on bad arguments.

const EVAL_PROVIDERS: readonly EvalProviderName[] = [...AI_PROVIDER_NAMES, 'mock'];

export interface EvalArgs {
  workloads: AiWorkload[];
  chain: EvalProviderName[];
  limit?: number | undefined;
  concurrency: number;
  delayMs: number;
  gate: GateOptions;
  out?: string | undefined;
  golden?: string | undefined;
  verbose: boolean;
}

/** An optional integer flag ≥ `min`, or `fallback` when absent. */
function intFlag(
  values: Map<string, string>,
  name: string,
  min: number,
  fallback: number,
  max = Number.MAX_SAFE_INTEGER,
): number {
  const raw = values.get(name);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`--${name} must be an integer between ${min} and ${max}`);
  }
  return n;
}

export function parseEvalArgs(argv: string[]): EvalArgs {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    if (eq > 0) {
      values.set(arg.slice(2, eq), arg.slice(eq + 1));
    } else if (argv[i + 1] !== undefined && !argv[i + 1]!.startsWith('--')) {
      values.set(arg.slice(2), argv[++i]!);
    } else {
      flags.add(arg.slice(2));
    }
  }

  const route = values.get('route');
  const provider = values.get('provider');
  if (!route || !provider) {
    throw new Error('usage: pnpm ai:eval --route=<workload|all> --provider=<chain|mock>');
  }
  const workloads =
    route === 'all'
      ? [...EVAL_WORKLOADS]
      : route.split(',').map((w) => {
          const name = w.trim();
          if (!isAiWorkload(name) || !EVAL_WORKLOADS.includes(name)) {
            throw new Error(
              `--route: "${name}" is not an evaluable workload (${EVAL_WORKLOADS.join(', ')}, all)`,
            );
          }
          return name;
        });
  const limitRaw = values.get('limit');
  const limit = limitRaw !== undefined ? Number(limitRaw) : undefined;
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
    throw new Error('--limit must be a positive integer');
  }
  return {
    workloads,
    chain: parseChain(provider, EVAL_PROVIDERS),
    limit,
    concurrency: intFlag(values, 'concurrency', 1, 1, 16),
    delayMs: intFlag(values, 'delay-ms', 0, 0),
    gate: {
      minSchemaValidPct: intFlag(values, 'min-schema', 0, DEFAULT_GATE.minSchemaValidPct, 100),
    },
    out: values.get('out'),
    golden: values.get('golden'),
    verbose: flags.has('verbose'),
  };
}

/** The chain under test as one IAIService: every workload runs `chain`. */
export function buildEvalService(chain: EvalProviderName[], config: ProviderConfig): IAIService {
  const providers = Object.fromEntries(
    chain.map((p, i) => [p, createProvider(p, config, { leadsMealPlan: i === 0 })]),
  );
  const routes = {} as Record<AiWorkload, EvalProviderName[]>;
  for (const w of AI_WORKLOADS) routes[w] = chain;
  return new ChainAIService({ providers, routes });
}

export async function main(): Promise<void> {
  let args: EvalArgs;
  try {
    args = parseEvalArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 2;
    return;
  }

  // Provider chatter ([ai.usage], "served by") would bury the table.
  if (!args.verbose) console.info = () => undefined;

  const service = buildEvalService(args.chain, loadEvalProviderConfig());
  const golden = loadGoldenSet(args.golden ?? GOLDEN_DIR);
  const provider = args.chain.join('>');
  const report: { summary: EvalSummary; results: CaseResult[] }[] = [];

  for (const [i, workload] of args.workloads.entries()) {
    // The pause between cases also separates workloads.
    if (i > 0 && args.delayMs > 0) await new Promise((r) => setTimeout(r, args.delayMs));
    process.stderr.write(`[ai:eval] ${workload} on ${provider}…\n`);
    report.push(
      await runEval(workload, provider, service, golden, {
        limit: args.limit,
        concurrency: args.concurrency,
        delayMs: args.delayMs,
        gate: args.gate,
        onCase: (r) =>
          process.stderr.write(
            `  ${r.ok ? (r.scores.schemaValid ? '✓' : '✗') : '!'} ${r.id} (${r.ms} ms)${
              r.error ? ` — ${r.error}` : ''
            }${r.scores.allergenDetails ? ` — ALLERGEN: ${r.scores.allergenDetails.join('; ')}` : ''}\n`,
          ),
      }),
    );
  }

  const summaries = report.map((r) => r.summary);
  process.stdout.write(`\n${formatSummaryTable(summaries)}\n\n`);
  const json = JSON.stringify({ provider, ranAt: new Date().toISOString(), report }, null, 2);
  if (args.out) {
    writeFileSync(args.out, `${json}\n`);
    process.stdout.write(`JSON report written to ${args.out}\n`);
  } else {
    process.stdout.write(`${json}\n`);
  }
  if (summaries.some((s) => !s.gatePassed)) process.exitCode = 1;
}
