// Phase 24 / CI-03 — Next.js 16 boot hook.
// register() is called once when a new server instance is initiated and must
// complete before the server is ready to handle requests. Throwing here aborts
// boot, which FAH treats as a failed rollout (keeps the previous version
// serving) rather than a healthy-but-broken container.
//
// Edge runtime guard per Pitfall 4: register() fires on both Node.js and Edge
// runtimes; Edge can't import Node modules and has a different env surface.
//
// Dynamic import per Pitfall 9: keeps assertEnv (and its env-schema import)
// out of the static module graph so Vitest can import ./lib/assertEnv from a
// test file without instrumentation.ts side-effects firing on test bootstrap.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { assertEnv } = await import('./lib/assertEnv');
    assertEnv();
  }
}
