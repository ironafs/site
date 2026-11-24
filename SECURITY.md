<!-- SPDX-FileCopyrightText: 2026 Adrian Ana <adrian@adrianana.com> -->
<!-- SPDX-License-Identifier: GPL-3.0-or-later -->

# Security policy

ironafs.org is a static website. It has no accounts and a strict Content
Security Policy.

It does use Google Analytics, under a regional default:

- If a visitor has no saved choice, the edge server uses their IP address to
  estimate their country. It answers only whether analytics is on by default.
  It sets no cookie and keeps no routine access log.
- For visits from the US, analytics is on by default, with a notice and a
  one-click opt-out.
- Everywhere else, and whenever the check fails, analytics stays off until
  the visitor allows it.
- Once analytics is on, Google receives the visitor's IP address, the pages
  they view and cookie identifiers. The full details are at
  https://www.ironafs.org/privacy.
- Global Privacy Control and an opt-out always turn analytics off.

A security flaw could let someone run their code in a visitor's browser, or
send visitors to a site that is not IronAFS.

## Reporting a vulnerability

Report it privately, never in a public issue. Either:

- email adrian@adrianana.com, with "ironafs.org security" in the subject, or
- use the **Report a vulnerability** button on the repository's Security tab.

Say what you found, how to reproduce it, and which page, browser or commit
is affected. You will get a reply within 7 days. Fixes are made in private.
They are disclosed once the fixed site is live, with credit to you unless
you prefer otherwise.

The site is built with AI models (see [AI.md](AI.md)). Until a
vulnerability is disclosed, its details go only to the Anthropic (Claude)
and OpenAI (GPT) models, and the fix is prepared in private. The other
models see it once it is public. IronAFS's workflow does the same
("Embargoed security fixes").

## Supported versions

The live site and `main`. There are no releases.

## Scope

In scope are this repository's code, its build and CI, and the pages and
response headers served at ironafs.org.

A vulnerability in IronAFS itself belongs in
[IronAFS's security policy](https://github.com/ironafs/ironafs/blob/main/SECURITY.md).
A vulnerability in a dependency, such as Astro or three.js, belongs with that
project. Please tell us too if it affects the site.
