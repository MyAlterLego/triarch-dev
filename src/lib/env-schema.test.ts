import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import { REQUIRED_ENV } from './env-schema';

interface ApphostingEnvBinding {
  variable: string;
  value?: string;
  secret?: string;
  availability?: string[];
}
interface ApphostingDoc {
  env?: ApphostingEnvBinding[];
}

describe('env-schema (admin)', () => {
  it('exports REQUIRED_ENV as a non-empty array of unique strings (length === 18)', () => {
    expect(Array.isArray(REQUIRED_ENV)).toBe(true);
    expect(REQUIRED_ENV.length).toBe(18);
    for (const name of REQUIRED_ENV) {
      expect(typeof name).toBe('string');
      expect(name.length).toBeGreaterThan(0);
    }
    const unique = new Set<string>(REQUIRED_ENV);
    expect(unique.size).toBe(REQUIRED_ENV.length);
  });

  it('every REQUIRED_ENV name is bound in apphosting.yaml (drift guard)', () => {
    const text = readFileSync(resolve(__dirname, '../../apphosting.yaml'), 'utf8');
    const doc = parse(text) as ApphostingDoc;
    const bound = new Set<string>();
    for (const e of doc.env ?? []) bound.add(e.variable);

    const missing = REQUIRED_ENV.filter((n) => !bound.has(n));
    expect(missing, `apphosting.yaml is missing bindings for: ${missing.join(', ')}`).toEqual([]);
  });
});
