# First-screen snapshot

Build-time static first screen for the home page. `bun run build` runs this
after Rsbuild:

1. start a local server for `dist/` with mocked `/api/stats` and local `/vendor/*`
2. capture the built home page at 1440×900 and 390×844 with headless Chrome
3. filter the captured CSS to rules matching the captured DOM
4. write `dist/home.html` with both variants inline, plus the app's global CSS
   inline when it is small (otherwise preload it asynchronously)
5. verify handover in the browser; on failure, delete `home.html`

The Worker serves `home.html` for `/` only; other routes keep `index.html`.

## Env

| Variable                                                  | Meaning                                |
| --------------------------------------------------------- | -------------------------------------- |
| `FIRST_SCREEN_SKIP=1`                                     | skip the snapshot (CI without Chrome)  |
| `FIRST_SCREEN_STRICT=1`                                   | fail the build instead of falling back |
| `FIRST_SCREEN_CSS_MODE=auto\|inline-css\|async\|blocking` | override the app CSS strategy          |
| `CHROME_PATH=/path/to/chrome`                             | Chrome/Chromium executable             |

## Notes

- The snapshot is a visual placeholder; it does not hydrate. It is removed
  once the real app has rendered.
- `/api/stats` is mocked with deterministic data during capture. The same
  values are the app's initial state (`src/shared/first-screen.ts`), so the
  handover does not wait for the live request; the real values replace the
  placeholders once it completes.
- `home.html` is public at `/home`; the Worker redirects it to `/`.
- Re-capture on every build. If capture or verification fails, the build falls
  back to the normal SPA shell rather than shipping a stale snapshot.
- `bun scripts/first-screen/check.ts [--strict]` does a quick structural check
  without launching a browser.
