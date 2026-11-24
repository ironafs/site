<!-- SPDX-FileCopyrightText: 2026 Adrian Ana <adrian@adrianana.com> -->
<!-- SPDX-License-Identifier: GPL-3.0-or-later -->

# ironafs.org: notes for Claude Code

The rules for every agent are in AGENTS.md:

@AGENTS.md

## Claude Code specifics

- Before every commit, push or merge, follow IronAFS's `land-change` rules
  (its ADR 0003): the maintainer's branch work follows them without asking;
  a merge to `main` is presented, with its exact message, to the human you
  work for, and waits for their approval.
- Before adding or upgrading any package, follow AGENTS.md "Dependencies".
- `review-lanes`: for the maintainer's controller session only. It needs
  the maintainer's local review tooling, which is not in this repository.
- `.claude/settings.json` blocks common credential commands. Its patterns
  match invocations, not everything that could read a secret, so the "no
  secrets" rule in AGENTS.md is what holds.
- Never stage changes to `CLAUDE.md` or `AGENTS.md` unless the task is to
  change them.
