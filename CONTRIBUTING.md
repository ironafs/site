<!-- SPDX-FileCopyrightText: 2026 Adrian Ana <adrian@adrianana.com> -->
<!-- SPDX-License-Identifier: GPL-3.0-or-later -->

# Contributing

This repository is the website of [IronAFS](https://github.com/ironafs/ironafs),
[ironafs.org](https://www.ironafs.org/).

The most useful contribution is a report of something wrong on the site. That
could be a fact that does not match the IronAFS repository, a statistic
without its source, a broken link, a page that renders badly, or an
accessibility problem. Open an issue for any of these, or to ask a question.
The maintainer arranges any review it needs. Comments about IronAFS itself go
to the [IronAFS repository](https://github.com/ironafs/ironafs).

Code contributions follow the same path as the maintainer's own changes. That
path is IronAFS's [workflow](https://github.com/ironafs/ironafs/blob/main/docs/workflow.md),
which this repository follows (see [AI.md](AI.md)).

The site's words, pictures, name and logo are not open to outside
contributions (see [LICENSING.md](LICENSING.md)). To change them, suggest the
change in an issue and the maintainer will make it. Pull requests change
code only.

Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md).
Pull requests are reviewed with AI models from several vendors (see
[AI.md](AI.md)), so what you submit is sent to them. Security problems go to
[SECURITY.md](SECURITY.md), not to public issues.

## Pull requests

- Before you start on an issue, say so in a comment, so that nobody else
  takes it (the workflow, §6). If you stop, comment again to free it.
- Make one change per pull request. Pull requests are squash-merged. The
  title becomes the commit subject, short and lowercase. The description
  becomes the commit body: what changed and why.
- For a class P, S or R change, open an issue or a spec-only draft pull
  request first. The classes are explained in
  [AI.md](AI.md#change-classes-how-careful-each-change-must-be) and the
  workflow, §1. The maintainer arranges the design or contract review that
  must happen before code is written.
- End the description with the trailer block from the pull request template:
  `Class:`, `Assisted-by:`, and an `AI-Reviewed-by:` for each model review
  whose final verdict covers the change as it lands (IronAFS ADR 0003,
  point 7). [AI.md](AI.md) explains each one.
- Put `Assisted-by:` on your branch commits too, but never
  `Signed-off-by:`. Your sign-off goes in the description. If a model wrote
  an issue, a comment or a review that you post, say so in a last line, such
  as `Written by <agent>:<model>.` (IronAFS ADR 0003).
- Sign off with your own `Signed-off-by: Your Name <email>` line. It
  certifies the [Developer Certificate of Origin 1.1](https://developercertificate.org/)
  for your change. The maintainer's sign-off is added after yours at merge.

## Before you open a pull request

The Node version is in `.nvmrc`. Run `npm ci`, then:

- `npm test`. It builds the site and runs the build tests in `tests/build/`.
  They check that the pages declare no remote resources, have no inline
  scripts, styles or handlers, and that every link and anchor resolves.
- `npm run test:e2e`. It builds the site and runs the Playwright suite against
  `tests/e2e/serve.mjs`, which sends the production headers. Run
  `npx playwright install chromium webkit` once first. The browser tests
  check that Google Analytics follows the regional default and the saved
  choice. `node tools/ci-local.mjs` runs the suite in CI's slices.
- `reuse lint`. CI requires it.

A new dependency needs the maintainer's decision first (IronAFS ADR 0001).
Before you add or upgrade a package, check its licence, pin its exact
version, and check what it adds to the built pages. The pages load nothing
from another origin.

## AI-assisted contributions

These are welcome. Using a model is fine; hiding it is not. Coding agents
read `AGENTS.md` (Claude Code reads it through `CLAUDE.md`), which states
these rules in a form agents follow.

- Disclose every model whose writing remains in the change with
  `Assisted-by: <agent>:<model id>`, or write `Assisted-by: none`.
- You are the author, and you answer for all of it. Read and understand
  everything you submit.
- Never let an agent write your `Signed-off-by:`. Add it yourself.
- Don't copy (IronAFS ADR 0001). Everyone is welcome, including people who
  know OpenAFS, AuriStor or the kernel's AFS and Rx code well. When you write
  code here:
  - write it from your own understanding and the specifications;
  - don't have another implementation's source open;
  - port or translate nothing;
  - never paste that source into a model's prompt.

  Say so in your pull request, and mention anything you know well that would
  help reviewers. If an NDA or your job covers non-public AFS source, ask
  first. If a model's output looks copied from anywhere, say so. Permissive
  third-party material keeps its notices and gets a row in
  [docs/provenance.md](docs/provenance.md). A change whose origin or licence
  is unclear will not be merged.

## Licence

You contribute code to the site under `GPL-3.0-or-later`, and certify it with
your DCO sign-off. The site's words, pictures, name and logo are all rights
reserved and take no outside contributions (see [LICENSING.md](LICENSING.md)
and [Name and trademark use](https://www.ironafs.org/trademarks)). Approved
third-party material keeps its own licence. Every file has an SPDX header or
a `REUSE.toml` entry (see [LICENSING.md](LICENSING.md#file-headers)), and
`reuse lint` passes.
