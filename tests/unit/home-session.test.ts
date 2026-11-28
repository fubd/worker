import { describe, expect, test } from 'bun:test';

import { shellFor, shellParts } from '../../src/worker/home-session';

const marker = '<!----yuyan-member-home---->';
const visitor = '<!doctype html><meta name="yuyan-home-auth" content="visitor">';
const member = '<!doctype html><meta name="yuyan-home-auth" content="member">';

describe('server verified home', () => {
  test('serves the member shell as the first HTML response', async () => {
    const [visitorShell, memberShell] = shellParts(`${visitor}${marker}${member}`);
    const html = shellFor(visitorShell, memberShell, true);
    expect(html).toContain('<meta name="yuyan-home-auth" content="member">');
  });

  test('keeps cookies out of shared caches for visitors', async () => {
    const [visitorShell, memberShell] = shellParts(`${visitor}${marker}${member}`);
    const html = shellFor(visitorShell, memberShell, false);
    expect(html).toContain('<meta name="yuyan-home-auth" content="visitor">');
    expect(html).not.toContain('<meta name="yuyan-home-auth" content="member">');
  });
});
