<!-- SPDX-FileCopyrightText: 2026 Adrian Ana <adrian@adrianana.com> -->
<!-- SPDX-License-Identifier: GPL-3.0-or-later -->

# How the IronAFS website uses AI

The IronAFS website, [ironafs.org](https://www.ironafs.org/), is made the same
way as IronAFS. One person writes it with AI models from five families:
Anthropic (Claude), OpenAI (GPT), Google (Gemini), Zhipu (GLM) and DeepSeek.

None of this is hidden. This file and the instructions the agents follow are
in this repository. The review records are in the pull requests, in their
descriptions and reviews.

The rules are IronAFS's own. They are in its
[ADR 0002](https://github.com/ironafs/ironafs/blob/main/docs/adr/0002-ai-use-and-attribution.md),
its [ADR 0003](https://github.com/ironafs/ironafs/blob/main/docs/adr/0003-branch-work-and-ai-disclosure.md)
and its [workflow](https://github.com/ironafs/ironafs/blob/main/docs/workflow.md),
which this repository follows. In this file, "the workflow" means that
document. Some of its rules name things a website does not have. For those,
the section "For a website" below says what the site does instead.

Why five families? Models from different families miss different things.
So the family that wrote a change never does a *required* review of it, and
important changes are reviewed by two families that did not write them. A
check by the same family may run as an extra, but it never counts as a
required review. IronAFS's review records show why this matters: in the
reviews of its first commit, the GPT, GLM, Gemini and Claude (Mythos)
reviewers each caught defects the others had missed.

The agents follow these instructions:

- `AGENTS.md`, the rules for every agent;
- `CLAUDE.md` and `.claude/`, for Claude Code.

The maintainer's own controller session also follows private instructions.
They cover how the maintainer personally runs the models and lands changes.
The rules they carry out are all public: in IronAFS's ADR 0002, its workflow,
and this file.

The reviews run through the maintainer's local tooling, which IronAFS's
workflow and its `review-lanes` skill describe. That tooling is not
published, because it is the maintainer's personal setup.

## Who does what

One person owns the project and approves every commit that lands on `main`.
The models come from five families, and each has a fixed role. No family does
a required review of its own family's work.

### The families and models

| Family | Models used here (id as recorded in trailers) | Reached through | Agent ids |
|---|---|---|---|
| Anthropic (Claude) | Claude Opus 5.5 (`claude-opus-5-5`), default; Claude Mythos 5.2 (`claude-mythos-5-2`, what Claude Code's `fable` alias serves) for the strongest seats; Claude Haiku 5.5 (`claude-haiku-5-5`) and Sonnet for light work, including Claude Code's own background steps | Claude Code CLI, Claude subscription | `claude-code` |
| OpenAI (GPT) | GPT-6.2 Sol (`gpt-6.2-sol`), default; GPT-6.2 Astra (`gpt-6.2-astra`) for the strongest seats | codex CLI, ChatGPT subscription | `codex` |
| Google (Gemini) | Gemini 4 Carbon (`gemini-4-carbon-medium`, also for its security seats; `gemini-4-carbon-high` for other class S and R and strongest seats); Gemini Flash and Argon for light work only | Antigravity CLI (`agy`) | `gemini`, `agy` |
| Zhipu / Z.ai (GLM) | GLM 5.3 (`glm-5.3`); GLM 5.3 Flash (`glm-5.3-flash`) for small helper steps | Claude Code CLI on Z.ai's endpoint, GLM Coding Plan | `glm` |
| DeepSeek | DeepSeek V4.1 Flash (`deepseek-flash`) | Claude Code CLI on DeepSeek's endpoint, DeepSeek API | `deepseek` |

The routing table in [the workflow](https://github.com/ironafs/ironafs/blob/main/docs/workflow.md)
§2, "Model routing", sets which model and effort each review seat uses.
Light models only help and gather research. Required reviews use the
standard tier. The named seats use the strongest tier. That section's
"Precedence" rule can override this.

Model versions change. A trailer always records the model that actually
answered, read from the tool's own log, not the model that was asked for.
When the defaults above change, this table changes in the same commit.

### The roles

| Role | Family | Agent id |
|---|---|---|
| Controller: plans, briefs, routes, verifies findings, drafts commits | Anthropic | `claude-code` |
| Implementer | Anthropic | `claude-code` (subagents the controller dispatches) |
| Implementer for extra capacity | OpenAI | `codex` |
| Implementer when codex is out of quota | Google | `agy` |
| Design, research, rulings (read-only) | OpenAI | `codex` |
| First reviewer of implemented code | Zhipu | `glm` |
| Second review family where the class needs two | OpenAI, Google, DeepSeek or Anthropic, whichever wrote none of the change and is not already the first reviewer | `codex` (read-only), `gemini`, `deepseek`, `claude-code` |
| Claude review seats (never the only reviewer of Claude's work) | Anthropic | `claude-code` |

Some accounts are flat-rate subscriptions and some are billed by use. Not
all of them report the cost of each run, so no cost is published per change.

### Pictures

Unlike IronAFS, the site has pictures made with image models. They are
listed here:

| What | Model | Licence of the model | Reached through |
|---|---|---|---|
| The story's art in `src/assets/story/` | Qwen-Image 2.1 drew `drops.png`; SeedVR2 (3B) upscaled `chip.png`, `forge.png` and `rust.png`, whose drawing model the files do not record ([docs/provenance.md](docs/provenance.md)) | Apache-2.0 | the maintainer's local studio |

The picture model is named in the description of the change that adds the
picture, not in a trailer. A trailer names an agent and its model, and the
studio is not an agent. The maintainer chooses, edits and approves every
picture, and looks at each one at full size. The prompts and the studio's
settings are not published, just as the review tooling is not. Generated
files are committed with their embedded generation metadata removed. The
brand files and the hero's poster are drawn by this repository's own code.

## Change classes: how careful each change must be

Every change gets a class. To choose it, ask: "if this change has a
plausible mistake, what goes wrong?" The higher the class, the more checks
and independent reviewers it needs. When in doubt, choose the higher class.

| Class | Name | A plausible mistake… | Website examples |
|---|---|---|---|
| **E** | Editorial | changes nothing the project claims or does | a typo, a broken link, a code comment |
| **I** | Internal | changes internals only; no input, output or stored byte differs | a refactor whose built pages are the same, new tests, a CI slice |
| **P** | Public | changes what a user, an admin or a server sees | copy, a fact or statistic about IronAFS, a picture, layout, motion, accessibility, page metadata, a URL |
| **S** | Safety | breaks security, data, consistency or concurrency | the CSP and response headers, anything loaded from another origin, a dependency or a GitHub Action, the build and deploy pipeline, anything stored in or about a visitor's browser |
| **R** | Irreversible | cannot be taken back | going public, a licence change, the domain and its DNS |

### Who writes and who must review

No model family reviews its own family's work. A required review always
comes from a family that wrote none of the change: none of its text or code,
and not the design it was built from. A family that reviewed an earlier
draft, or gathered research the change draws on, is not an author, as long
as none of its text entered the change
([the workflow](https://github.com/ironafs/ironafs/blob/main/docs/workflow.md) §2).

| Class | Usually written by | Required reviews before merge | Other checks |
|---|---|---|---|
| **E** | Claude or the owner | none; the owner re-reads it | links resolve |
| **I** | Claude | one other family: GLM or GPT for Claude's or the owner's own work; GLM for codex's or agy's | tests and lints pass |
| **P** | Claude | as I, and the written contract (what users will see) is reviewed before any code | contract first |
| **S** | Claude, from a design | the design is reviewed before code; the code by the first reviewer for its author (GLM, or GPT for Claude's work), plus a second family (Gemini, DeepSeek, GPT or Claude, whichever did not write it) when the CSP, the response headers, another origin, a dependency or the build and deploy pipeline are involved (for a website, in place of tokens, the wire or cache coherency); a security review by GPT, Claude, GLM or Gemini, whichever wrote neither the design nor the code | a test that reproduces the failure |
| **R** | as S | as S | the owner's decision |

If too few independent families are available, the change waits. The bar is
never lowered. Every class ends the same way. The owner sees the change and
its exact commit message, and nothing lands without their approval.

### What each model can do here

| Model (family) | Controller | Writes code | Design and research | Reviews others' code | Security review |
|---|---|---|---|---|---|
| Claude Opus 5.5 (Anthropic) | yes | yes (main implementer, as subagents) | yes | yes (default Claude seat) | no: Mythos takes Claude's security seats |
| Claude Mythos 5.2 (Anthropic) | | promoted implementation only | the strongest seats: judgements, class R designs, architecture ADRs, load-bearing research synthesis | judgements | yes, every Claude security review |
| GPT-6.2 Sol (OpenAI, via codex) | | yes (extra capacity, separate tasks) | yes, read-only | yes, read-only, never codex's own work | no: Astra takes GPT's security seats |
| GPT-6.2 Astra (OpenAI, via codex) | | after two recorded failures on the same defect | the strongest seats: judgements, class R designs, architecture ADRs, load-bearing research synthesis | judgements | yes, the default GPT security seat |
| Gemini 4 Carbon (Google, via agy) | | when codex is out of quota | | yes, second family | yes, at `gemini-4-carbon-medium`, when it wrote neither the design nor the code ([record](https://github.com/ironafs/ironafs/blob/main/docs/reviews/2026-11-22-gemini-security-seat.md)) |
| GLM 5.3 (Zhipu) | | | second view | yes, first reviewer | yes, when it wrote neither the design nor the code |
| DeepSeek V4.1 Flash (DeepSeek) | | | research | yes, second family, off-peak (paid) | |

When two reviewers disagree and the evidence does not settle it, a third
family rules on the evidence. It uses the model that §2's "Model routing"
assigns to that seat, which is the family's strongest unless that section's
"Precedence" rule says otherwise (the judgement seat,
[the workflow](https://github.com/ironafs/ironafs/blob/main/docs/workflow.md) §2).

The rules that decide are in [the workflow](https://github.com/ironafs/ironafs/blob/main/docs/workflow.md)
§1 and §2.

### For a website

The workflow is written for a Rust client. Some of its rules name things a
website does not have. For those, the site does the following, and nothing
else changes.

- **Tools.** Where the workflow names `cargo xtask check`, clippy, nextest or
  the `rust-review` skill, the site runs `npm test`, the e2e suite and
  `reuse lint` (see [CONTRIBUTING.md](CONTRIBUTING.md)). The author's
  self-check and the consistency pass list the changed functions,
  components and styles in the same way.
- **The trailers check.** IronAFS checks trailers in CI with
  `cargo xtask trailers`. The site has no xtask, so the owner checks the
  trailer block when approving the exact message.
- **Contracts, designs and decisions.** A contract (class P) or a design
  (class S and R) is written in the change's issue or in a spec-only draft
  pull request. It is reviewed there before any code, as the workflow
  requires. The site keeps no ADRs of its own. Its decisions are recorded in
  those issues and pull requests, with their review records.

## Reading a commit on `main`

Each commit on `main` is one checked change, squash-merged from a pull
request after the owner approved it. The one exception is the first commit
of the public history, which had no `main` to merge into. IronAFS's ADR 0002
gives a checklist for that case, and this repository's first commit followed
it. Every commit on `main` ends with a trailer block:

```
Class: S
Assisted-by: claude-code:claude-opus-5-5
Assisted-by: codex:gpt-6.2-sol
AI-Reviewed-by: glm:glm-5.3
AI-Reviewed-by: gemini:<served model id>
Signed-off-by: Adrian Ana <adrian@adrianana.com>
```

- `Class:` is the change's class.
- `Assisted-by:` names a model whose writing remains in the change, in the
  code, tests, docs or message. The id is the model that actually answered.
  `Assisted-by: none` means no model wrote any of it.
- `AI-Reviewed-by:` names a review whose final verdict covers the change as
  it landed. That means what it reviewed, plus fixes that were verified, or
  recorded fixes of its own minor findings. Earlier rounds are in the review
  record.
- `Signed-off-by:` is the human's [Developer Certificate of
  Origin](https://developercertificate.org/) sign-off. The owner sees the
  diff and the exact message of every merge before it lands. Their sign-off
  is added only after they approve, so the certification is always a
  person's. Outside contributors write their own.
- Models never get `Co-authored-by:`. That trailer is for people.

To list the models behind each commit:

```sh
git log --format='%h %s%n  %(trailers:key=Assisted-by,valueonly,separator=%x2C )'
```

Working commits on a branch carry `Assisted-by:` too. An issue, a pull
request description, a comment or a review written by a model ends with a
line naming the model, such as `Written by codex:gpt-6.2-sol.` When it is
posted from someone else's account, the line says for whom:
`Written by claude-code:claude-opus-5-5 for the maintainer.`
([ADR 0003](https://github.com/ironafs/ironafs/blob/main/docs/adr/0003-branch-work-and-ai-disclosure.md)).

The pull request behind each commit keeps the full story: the working
commits, each review verdict and the fix rounds. Raw agent transcripts are
not published, because they can contain secrets and personal data.

## What the owner checks before approving a commit

- The change does what its description says, and its class is right.
- The class's checks passed. Every confirmed finding is fixed, refuted with
  evidence, or closed in a way [the workflow](https://github.com/ironafs/ironafs/blob/main/docs/workflow.md)
  §3, step 7 allows: deferred to a specification item that a refutation
  reviewer agreed to, or judged not to hold.
- The trailers are true: the right models, the ids that actually answered,
  and no reviews that have gone stale.
- Provenance. Nothing from OpenAFS, AuriStor or the kernel's AFS and Rx code
  goes in (the don't-copy rule in [ADR 0001](https://github.com/ironafs/ironafs/blob/main/docs/adr/0001-licence-and-dont-copy.md)).
  Permissive third-party material keeps its notices and is listed in
  [docs/provenance.md](docs/provenance.md), whoever or whatever copied it.

## Copyright

The project's licences cover what can be copyrighted in it. The US Copyright
Office's position is that purely AI-generated material is not protected, but
a person's creative selection, arrangement and changes can be. Using AI does
not change who is responsible for the code. The person who signs off is.

## Contributing with AI

Welcome, under the same rules: see [CONTRIBUTING.md](CONTRIBUTING.md).
