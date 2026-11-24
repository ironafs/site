<!-- SPDX-FileCopyrightText: 2026 Adrian Ana <adrian@adrianana.com> -->
<!-- SPDX-License-Identifier: GPL-3.0-or-later -->

# ironafs.org: instructions for coding agents

These rules apply to every AI agent working in this repository (Claude Code,
codex, Antigravity, or any other), and to the people directing them.

This repository is the website of IronAFS, a modern AFS client in Rust
([ironafs/ironafs](https://github.com/ironafs/ironafs)): an Astro static site
with a three.js hero, a scroll story told section by section, and the brand
files. It has no server code or accounts. Google Analytics is on by default for US visits after an edge GeoIP check, with a one-click opt-out; elsewhere or if the check fails, it is off until allowed. Global Privacy Control forces it off; closing the notice is not consent.

## Start here

- The open issues on GitHub: where work stands and what comes next.
- IronAFS's [workflow](https://github.com/ironafs/ironafs/blob/main/docs/workflow.md): how changes are classed
  (E/I/P/S/R), made and reviewed. This repository follows it; `AI.md` says
  what it means for a website.
- IronAFS's [ADR 0001 (licence and "don't copy")](https://github.com/ironafs/ironafs/blob/main/docs/adr/0001-licence-and-dont-copy.md) before writing any code,
  and ADR 0002 (AI attribution) before any commit
  ([decisions](https://github.com/ironafs/ironafs/blob/main/docs/adr/README.md)).
- `AI.md`: how AI is used here, and how commits credit it.
- `CONTRIBUTING.md`: how a change gets in.
- `LICENSING.md` and [Name and trademark use](https://www.ironafs.org/trademarks): which files are code (GPL) and which
  are reserved content, and how the name and logo may be used.

Spec first: new work starts with a written contract or design, in its issue
or a spec-only draft pull request, not with code.

## Commands

- install: `npm ci`
- build: `npm run build` (static output in `dist/`)
- test: `npm test` (build, then the build tests in `tests/build/`)
- browser tests: `npm run test:e2e`, or `node tools/ci-local.mjs` for CI's
  slices (`npx playwright install chromium webkit` once)
- licences: `reuse lint`

## Hard rules

- **Licence.** The site's code is `GPL-3.0-or-later`. Its words, pictures,
  name and logo are all rights reserved
  (`LICENSING.md`). Every file has an SPDX header or a `REUSE.toml` entry.
  Copy goes only in the data modules in `src/content/`, pictures only under
  the reserved paths in `REUSE.toml`; no visitor-facing string is written
  inline in code. Third-party material keeps its own licence (ADR 0001).
- **Don't copy** (ADR 0001).
  - No code from OpenAFS, AuriStor, or the Linux kernel's AF_RXRPC or kafs:
    nothing copied, ported or translated, and nothing generated from their
    files.
  - Never put their source, or their file and function names, into a model's
    prompt.
  - Work from published specifications, observed behaviour and `docs/specs/` (planned).
  - Permissive third-party material keeps its notices and gets a
    `docs/provenance.md` row in the same commit.
- **Names.** Never use "OpenAFS" or "AuriStor" in a product, crate or package
  name. "AFS client" and "works with OpenAFS cells" are fine as descriptions.
- **Same-origin by default.** There are no CDN assets, remote fonts or embeds.
  The sole exception is Google Analytics under the regional policy described above. Build tests
  reject external resources declared in HTML and CSS, and browser tests
  require zero third-party requests before a grant or an applicable US default. No inline scripts,
  `style=` or `on*=` attributes (the CSP forbids them). Keep these checks.
- **Facts come from their sources.** What the site says about IronAFS cites
  the IronAFS file and line it comes from, in the PR description. A
  statistic carries its population, its period and a source link on the
  page. Illustrations are labelled as illustrative. No copy names another AFS
  implementation's files or presents OpenAFS or AuriStor as the problem.
- **Reuse and neighbours.** New code reuses what exists and reads like the code
  around it (the workflow, §3a). Name any deliberate departure, with its
  reason.
- **Dependencies.** Our own code first. A package only with the owner's
  decision, before the edit: its licence checked, its exact version pinned,
  and nothing it adds loading from another origin.
- **No history in source.** Source carries no development history, task ids
  (other than a public issue in a `TODO(#123)`), or reviewer or model
  attribution. Those go in commit trailers and
  pull request descriptions. Source never points to unpublished documents.
- **No secrets.** Run no command that could print a credential: tokens,
  keychains, `env`, git credential configuration.
- **Public by default.** Everything tracked is written to be public. No paths
  outside the repository, hostnames, cell names, keys or private notes in
  files, PR descriptions or review records. Generated pictures are committed
  with their generation metadata stripped. Commits are authored and
  committed as `Adrian Ana <adrian@adrianana.com>` for the maintainer's work.

## Commits (IronAFS ADR 0002)

- One branch per change. A change lands on `main` by pull request, as one
  squash commit, after its class's checks.
- The PR description becomes the commit message. It ends with one trailer
  block:
  - `Class:`;
  - `Assisted-by: <agent>:<model id>` for each model whose writing remains,
    or `Assisted-by: none`;
  - `AI-Reviewed-by:` for model reviews that cover the final change;
  - each human's `Signed-off-by:`.

  `AI.md` explains each one.
- **A `Signed-off-by:` is a human's certification** under the Developer
  Certificate of Origin. Contributors write their own line, in the PR
  description; an agent never writes it for them. Branch commits carry
  none. The one disclosed exception is the maintainer's: after the owner
  approves the exact final message of a squash merge, or of the root commit
  of the public history (the one commit made without a PR), their session
  adds the owner's line (ADR 0002).
- **Branch commits** carry `Assisted-by:` (or `Assisted-by: none`), never
  `Signed-off-by:`, `Class:` or `AI-Reviewed-by:`. Never rewrite a commit
  once it is pushed or under review; scan outgoing commits for secrets
  before pushing (ADR 0003).
- **Disclose model writing beyond commits.** An issue, pull request
  description, comment or review written by a model ends with a line such as
  `Written by <agent>:<model>.`, adding for whom when it writes for someone
  else's account (ADR 0003).
- Never add `Co-authored-by:` for a model.
