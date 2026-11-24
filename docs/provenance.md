<!-- SPDX-FileCopyrightText: 2026 Adrian Ana <adrian@adrianana.com> -->
<!-- SPDX-License-Identifier: GPL-3.0-or-later -->

# Provenance of third-party material

Every piece of third-party material in this repository, or shipped by the
built site, has a row here, as in IronAFS's `docs/provenance.md`. It keeps its
own licence and notices. `REUSE.toml` declares the licence of each file in the
repository, and `public/licences.txt` carries the full notices for what the
built site ships. A change that adds third-party material adds its row in the
same commit.

## In the repository

| Material | Where | Origin | Licence | Copyright | Notes |
|---|---|---|---|---|---|
| Space Grotesk Bold | `brand/src/fonts/SpaceGrotesk-Bold.woff`, `brand/src/fonts/LICENSE-OFL.txt` | [floriankarsten/space-grotesk](https://github.com/floriankarsten/space-grotesk) | `OFL-1.1` | 2020 The Space Grotesk Project Authors | No Reserved Font Name. Used by `brand/src/build_svgs.py` to draw the logo. |
| Seven glyphs of Space Grotesk Bold | `src/assets/hero/letters.typeface.json` | converted from the font above by `brand/src/glyphs.py` | `OFL-1.1` | 2020 The Space Grotesk Project Authors; conversion 2026 Adrian Ana | A Modified Version under the OFL. Shipped in the 3D letters' script. |
| The GitHub mark | `src/components/Header.astro` (one SVG `path`, on every page) | [Primer Octicons](https://github.com/primer/octicons) `icons/mark-github-16.svg` at commit `b5a1530` (2023-01-05, version 17.10.x); path data identical | `MIT` | 2023 GitHub Inc. (the licence file at that commit) | Used as a link to GitHub. [GitHub's logo guidelines](https://github.com/logos) also apply. |

## Shipped by the built site, installed by `npm ci`

Checked against the built `dist/` and the installed `node_modules`. The
Astro client runtime is not shipped: the pages have no islands.

| Package | Version | Licence | Copyright (from its licence file) | In the built site |
|---|---|---|---|---|
| `three` (with its `examples/jsm` add-ons: EffectComposer, RenderPass, ShaderPass, OutputPass, UnrealBloomPass, RoomEnvironment, TextGeometry, FontLoader) | 0.187.0 | `MIT` | 2010-2026 three.js authors | the hero's and the Rust word's scripts |
| `vite` (its module preload helper) | 8.3.8 | `MIT` | 2019-present, VoidZero Inc. and Vite contributors | `_astro/preload-helper.*.js` |
| `@fontsource/space-grotesk` | 5.3.0 | `OFL-1.1` | 2020 The Space Grotesk Project Authors | the 500 and 700 Latin fonts |
| `@fontsource/jetbrains-mono` | 5.3.0 | `OFL-1.1` | 2020 The JetBrains Mono Project Authors | the 500 and 700 Latin fonts |

Build and test dependencies that ship nothing in the built site:
`astro` 7.4.12 and `@astrojs/sitemap` 3.7.5 (`MIT`), `@playwright/test`
(`Apache-2.0`), `@axe-core/playwright` and `axe-core` (`MPL-2.0`),
`typescript` (`Apache-2.0`).

## Made with AI models (not third-party; listed for completeness)

The pictures in `src/assets/story/` were made in the maintainer's local
studio. Qwen-Image 2.1 drew `drops.png`. SeedVR2 (3B) upscaled `chip.png`,
`forge.png` and `rust.png`, and the files do not record which model drew
them. `rust-only.png` is a crop of `rust.png`. Both named
models are published under `Apache-2.0`, which puts no condition on their
output. See [AI.md](../AI.md#pictures).
