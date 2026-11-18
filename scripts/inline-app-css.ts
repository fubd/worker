import { readFileSync } from 'node:fs';

const MAX_INLINE_CSS_BYTES = 50_000;

/**
 * Inline the small application stylesheet into the HTML shell.
 *
 * The loading shell is already in the HTML body, but a render-blocking
 * stylesheet in <head> prevents the browser from painting it until a second
 * network request completes. The current CSS is under 9 kB and has no external
 * URLs, so inlining removes that request for both global and CN variants.
 */
export function inlineAppCss(html: string, distDir: string): string {
  let inlined = 0;
  const output = html.replace(/<link\b[^>]*>/gi, (tag) => {
    if (!/\brel=["']stylesheet["']/i.test(tag)) return tag;

    const href = tag.match(/\bhref=["']([^"']+\.css)["']/i)?.[1];
    if (!href) throw new Error(`stylesheet link has no CSS href: ${tag}`);
    if (!href.startsWith('/static/css/')) {
      throw new Error(`unexpected application stylesheet path: ${href}`);
    }

    const css = readFileSync(`${distDir}${href}`, 'utf8');
    if (Buffer.byteLength(css) > MAX_INLINE_CSS_BYTES) {
      throw new Error(`${href} is too large to inline safely`);
    }
    if (/@import/i.test(css) || /url\s*\(/i.test(css)) {
      throw new Error(`${href} contains external CSS references`);
    }

    inlined += 1;
    return `<style id="swan-app-css" data-source="${href}">${css.replace(/<\/style/gi, '<\\/style')}</style>`;
  });

  if (inlined === 0) throw new Error('no application stylesheet found to inline');
  return output;
}
