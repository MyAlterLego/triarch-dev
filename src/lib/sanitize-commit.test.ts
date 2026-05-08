import { describe, it, expect } from 'vitest';
import { sanitizeForSlack, sanitizeForRender } from './sanitize-commit';

// ============================================================
// sanitizeForSlack — Slack mrkdwn injection prevention
// ============================================================

describe('sanitizeForSlack', () => {
  // --- Broadcast mentions ---

  it('removes <!channel> broadcast mention', () => {
    const result = sanitizeForSlack('Hey <!channel> please review');
    expect(result).not.toContain('<!channel>');
    expect(result).not.toMatch(/<!channel>/i);
  });

  it('removes <!here> broadcast mention', () => {
    const result = sanitizeForSlack('Alert <!here> urgent issue');
    expect(result).not.toContain('<!here>');
    expect(result).not.toMatch(/<!here>/i);
  });

  it('removes <!everyone> broadcast mention', () => {
    const result = sanitizeForSlack('Fix bug <!everyone> sees');
    expect(result).not.toContain('<!everyone>');
    expect(result).not.toMatch(/<!everyone>/i);
  });

  it('handles case-insensitive <!Channel> mixed-case variant', () => {
    const result = sanitizeForSlack('Hey <!Channel> look at this');
    // The leading `<!` trigger must be neutralized regardless of case
    expect(result).not.toMatch(/<!channel/i);
  });

  // --- User / Channel / Group mentions ---

  it('removes <@U123ABC> user mention', () => {
    const result = sanitizeForSlack('Assigned to <@U123ABC> today');
    expect(result).not.toContain('<@U123ABC>');
    expect(result).not.toMatch(/<@U[A-Z0-9]+>/);
  });

  it('removes <#C123ABC> channel mention', () => {
    const result = sanitizeForSlack('Posted in <#C123ABC>');
    expect(result).not.toContain('<#C123ABC>');
    expect(result).not.toMatch(/<#C[A-Z0-9]+>/);
  });

  it('removes <!subteam^S123ABC> usergroup mention', () => {
    const result = sanitizeForSlack('Notify <!subteam^S123ABC> team');
    expect(result).not.toContain('<!subteam^S123ABC>');
    expect(result).not.toMatch(/<!subteam\^S[A-Z0-9]+>/);
  });

  // --- Slack link syntax ---

  it('replaces <https://example.com|click here> with plain URL', () => {
    const result = sanitizeForSlack('See <https://example.com|click here> for details');
    expect(result).toContain('https://example.com');
    expect(result).not.toContain('|click here>');
    expect(result).not.toMatch(/<https?:\/\/[^|>]+\|[^>]*>/);
  });

  it('prevents <https://evil.com|google.com> from rendering as a Google link', () => {
    const result = sanitizeForSlack('<https://evil.com|google.com>');
    // Must expose the real URL, not the deceptive label
    expect(result).toContain('https://evil.com');
    expect(result).not.toContain('google.com');
  });

  // --- Content preservation ---

  it('preserves plain commit message unchanged', () => {
    const msg = 'Fix: button alignment';
    expect(sanitizeForSlack(msg)).toBe(msg);
  });

  it('preserves code-fence content', () => {
    const msg = 'Refactor `useState` hook usage';
    expect(sanitizeForSlack(msg)).toBe(msg);
  });

  it('preserves numbers and punctuation including tracker tokens', () => {
    const uuid = '12345678-1234-1234-1234-123456789abc';
    const msg = `Fix: closes #BUG-${uuid} via PR #42`;
    expect(sanitizeForSlack(msg)).toBe(msg);
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeForSlack('')).toBe('');
  });

  it('is idempotent: double-apply equals single-apply', () => {
    const input = 'Fix bug <!channel> and <@U123ABC> notified at <https://evil.com|google.com>';
    const once = sanitizeForSlack(input);
    const twice = sanitizeForSlack(once);
    expect(twice).toBe(once);
  });
});

// ============================================================
// sanitizeForRender — Unicode trickery prevention
// ============================================================

describe('sanitizeForRender', () => {
  // --- Unicode trickery removal ---

  it('removes RTL override character U+202E', () => {
    // Fixture: 'evil' + RTL override + 'moc.live' — would visually reverse 'moc.live' to 'evil.com'
    const malicious = 'evil‮moc.live';
    const result = sanitizeForRender(malicious);
    expect(result).not.toContain('‮');
    expect(result).toBe('evilmoc.live');
  });

  it('removes LTR override character U+202D', () => {
    const input = 'normal‭text';
    expect(sanitizeForRender(input)).not.toContain('‭');
    expect(sanitizeForRender(input)).toBe('normaltext');
  });

  it('removes zero-width space U+200B', () => {
    const input = 'split​word';
    expect(sanitizeForRender(input)).not.toContain('​');
    expect(sanitizeForRender(input)).toBe('splitword');
  });

  it('removes zero-width non-joiner U+200C', () => {
    const input = 'split‌word';
    expect(sanitizeForRender(input)).not.toContain('‌');
    expect(sanitizeForRender(input)).toBe('splitword');
  });

  it('removes zero-width joiner U+200D', () => {
    const input = 'split‍word';
    expect(sanitizeForRender(input)).not.toContain('‍');
    expect(sanitizeForRender(input)).toBe('splitword');
  });

  it('removes BOM / zero-width no-break space U+FEFF', () => {
    const input = '﻿leading bom';
    expect(sanitizeForRender(input)).not.toContain('﻿');
    expect(sanitizeForRender(input)).toBe('leading bom');
  });

  // --- Content preservation ---

  it('preserves normal Unicode: café (U+00E9)', () => {
    const msg = 'Fixed café menu rendering';
    expect(sanitizeForRender(msg)).toBe(msg);
  });

  it('preserves emoji', () => {
    const msg = 'Deploy 🚀 complete';
    expect(sanitizeForRender(msg)).toBe(msg);
  });

  it('preserves newlines and tabs', () => {
    const msg = 'Line one\nLine two\tTabbed';
    expect(sanitizeForRender(msg)).toBe(msg);
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeForRender('')).toBe('');
  });

  it('is idempotent: double-apply equals single-apply', () => {
    const input = 'evil‮moc.live with ​zero‌width‍chars and ﻿bom';
    const once = sanitizeForRender(input);
    const twice = sanitizeForRender(once);
    expect(twice).toBe(once);
  });
});

// ============================================================
// Combined / chokepoint scenarios
// ============================================================

describe('sanitize-commit chokepoint scenarios', () => {
  it('neutralizes realistic malicious commit: "Fix bug <!channel>"', () => {
    const commit = 'Fix bug <!channel> to prevent regression';
    const result = sanitizeForSlack(commit);
    expect(result).not.toContain('<!channel>');
    // Content still readable — something meaningful remains
    expect(result).toContain('Fix bug');
    expect(result).toContain('to prevent regression');
  });

  it('neutralizes U+202E RTL override in a commit message for safe render', () => {
    // Simulates a commit message with embedded RTL override for visual deception
    const commit = 'Fix login for evil‮moc.live users';
    const result = sanitizeForRender(commit);
    expect(result).not.toContain('‮');
    expect(result).toContain('Fix login');
    expect(result).toContain('evilmoc.live');
  });
});
