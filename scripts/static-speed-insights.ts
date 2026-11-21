import pkg from '../package.json';

const SPEED_INSIGHTS_VERSION = pkg.dependencies['@vercel/speed-insights'].replace(/^\D+/, '');

/**
 * Vercel Speed Insights is mounted by React on SPA routes. Static first-screen
 * snapshots do not load React, so inject the same collector into their HTML.
 */
export function staticSpeedInsightsScript(route = '/'): string {
  return `<script defer src="/_vercel/speed-insights/script.js" data-sdkn="@vercel/speed-insights/react" data-sdkv="${SPEED_INSIGHTS_VERSION}" data-route="${route}"></script>`;
}

export function injectStaticSpeedInsights(html: string, route = '/'): string {
  if (html.includes('/_vercel/speed-insights/script.js')) return html;
  return html.replace('</body>', `  ${staticSpeedInsightsScript(route)}\n</body>`);
}
