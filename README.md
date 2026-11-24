# IronAFS website

This is the source of **ironafs.org**, the website of [IronAFS](https://github.com/ironafs/ironafs).

- `src/` holds the Astro site's code, text, artwork and font data. The text is in `src/content/`, and the artwork and font data are in `src/assets/`.
- `brand/` holds the logo, the icons and the social card, with the scripts that make them. See `brand/README.md`.
- `AI.md` explains how the site is built and reviewed. `CONTRIBUTING.md` explains how to take part. `SECURITY.md` explains how to report a security problem.

## Development

The Node version is in `.nvmrc`.

- `npm ci` installs the pinned dependencies.
- `npm run dev` starts the Astro dev server.
- `npm run build` builds the static site into `dist/`.
- `npm test` builds the site and runs the policy tests in `tests/build/`. They check that the pages declare no external resources, have no inline scripts, styles or handlers, and that every link and anchor resolves.
- `npm run test:e2e` builds the site and runs the Playwright suite against `tests/e2e/serve.mjs`, which sends the production headers. Run `npx playwright install chromium webkit` once first.

## Licence

Copyright © 2026 Adrian Ana. The code is free software under the GNU General Public License, version 3 or later (`GPL-3.0-or-later`). See `LICENSE`. The words, the pictures, and the IronAFS name and logo are not free: all rights are reserved. See `LICENSING.md` and [Name and trademark use](https://www.ironafs.org/trademarks). Third-party material keeps its own licence, listed in `docs/provenance.md`.
