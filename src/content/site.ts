import { links } from '../data/links.ts';
import type { Built, Footer, NavItem, Site } from '../lib/types';

export const site = {
  name: 'IronAFS',
  author: 'Adrian Ana',
  url: links.siteUrl,
  title: 'IronAFS: AFS in user space',
  identity: 'IronAFS · AFS in user space',
  tagline: 'An independent AFS-3 client being built in Rust.',
  headline: 'AFS in user space.',
  subline: 'No kernel module, no kext, no driver. IronAFS is built on the file-system support your OS already has, with no kernel code of its own to sign, approve or rebuild.',
  ogImage: links.ogImage,
  ironafsLicence: 'GPL-3.0-or-later',
} satisfies Site;

export const nav = [
  { href: '/#why', label: 'why' },
  { href: '/#what', label: 'what' },
  { href: '/#design', label: 'design' },
  { href: '/#status', label: 'status' },
] satisfies NavItem[];

// The mobile menu sheet: six path rows with a one-line description, then plain link rows.
export const menu = {
  paths: [
    { href: '/#why', label: 'why', desc: 'the kernel driver problem' },
    { href: '/#what', label: 'what', desc: 'the protocol, and where IronAFS fits' },
    { href: '/#design', label: 'design', desc: 'one core, three thin layers' },
    { href: '/#status', label: 'status', desc: 'where it stands today' },
    { href: '/#built', label: 'built', desc: 'how one person builds it with AI models' },
    { href: '/#follow', label: 'follow', desc: 'watch the repository, read the plans' },
  ],
  links: [
    { label: 'GitHub', href: links.github },
    { label: 'Milestones', href: links.milestones },
    { label: 'Design docs', href: links.docs },
  ],
  open: 'Menu',
  close: 'Close menu',
};

export const built = {
  eyebrow: 'built',
  heading: 'How IronAFS is built',
  intro: "One maintainer builds IronAFS with AI models from five families. A family that wrote any part of a change, or the design it was based on, can't do a required review of it. In the reviews of the project's first commit, GPT, GLM, Gemini and Claude Mythos each found defects the others missed.",
  families: {
    head: ['Family', 'Main models', 'Role'],
    rows: [
      ['Anthropic', 'Claude Mythos 5.2 for the hardest design, judgement and security reviews; Claude Opus 5.5 by default', 'Plans and assigns the work, checks findings, writes most of the code, reviews.'],
      ['OpenAI', 'GPT-6.2 Astra for the hardest design, judgement and security reviews; GPT-6.2 Sol, via codex, by default', 'Extra implementation capacity; read-only design, research, rulings and reviews.'],
      ['Zhipu', 'GLM 5.3', 'The usual first code reviewer; security reviews.'],
      ['Google', 'Gemini 4 Carbon, via Antigravity', 'Implements when codex is out of quota; second-family and security reviews.'],
      ['DeepSeek', 'DeepSeek V4.1 Flash', 'Research; second-family reviews.'],
    ],
  },
  classes: {
    heading: 'Every change gets a class',
    lead: 'Each change is classed by asking: if it has a plausible mistake, what goes wrong? When in doubt, the higher class wins.',
    head: ['Class', 'A plausible mistake…', 'Example', 'Before it can merge'],
    rows: [
      ['E Editorial', 'changes nothing the project claims or does', 'a typo, a broken link', 'the owner re-reads it; links must resolve'],
      ['I Internal', 'changes internals only; no input, output or stored byte differs', 'a refactor, new tests', 'one review from another family; tests and lints pass'],
      ['P Public', 'changes what users, admins or servers see', 'a new afs subcommand, an error message', 'the written contract is reviewed before any code, then one review'],
      ['S Safety', 'breaks security, data, consistency or concurrency', 'parsing fileserver replies, token storage, cache invalidation', "the design is reviewed before code; a code review, and a second family's when tokens, the wire or cache coherency are involved; a separate security review; a test that reproduces the failure"],
      ['R Irreversible', "can't be taken back", 'an on-disk format promised to be readable forever, a release, a licence change', "everything Safety needs, plus the owner's decision"],
    ],
  },
  waits: 'If too few independent families are available, a change waits. The bar is never lowered.',
  provenance: "No code comes from other AFS implementations or from the kernel's AFS and Rx code (ADR 0001). Permissively licensed third-party material keeps its notices and is listed in the provenance log.",
  human: 'The human stays in charge.',
  humanBody: 'The owner approves the diff and the exact commit message before anything lands on main. Each commit names the models whose writing remains in it (Assisted-by) and the reviews that covered it (AI-Reviewed-by); models are never listed as co-authors. The review records are public.',
  links: [
    { label: 'AI.md', href: links.ai },
    { label: 'How a change is classed, made and reviewed', href: links.workflow },
    { label: 'ADR 0001', href: links.adr0001 },
    { label: 'Provenance log', href: links.provenance },
    { label: 'Review records', href: links.reviews },
  ],
} satisfies Built;

export const follow = {
  eyebrow: 'follow',
  heading: 'Follow along',
  intro: 'Nothing to install yet, but plenty to read: the accepted architecture, the protocol specifications written so far, and the code as it lands. Star or watch the repository to follow along.',
  buttons: [
    { label: 'View source', href: links.github },
    { label: 'Read the design', href: links.docs },
    { label: 'Follow development', href: links.milestones },
  ],
  licence: 'IronAFS is free software under the GNU General Public License, version 3 or later (GPL-3.0-or-later).',
};

export const footer = {
  site: 'Site',
  project: 'Project',
  built: 'Built by Adrian Ana',
  author: [
    { label: 'adrianana.com', href: links.author },
    { label: 'LinkedIn', href: links.linkedin },
  ],
  copyright: 'Copyright © 2026 Adrian Ana',
  licence: 'IronAFS:',
  siteLicence: {
    before: 'This website\'s code is GPL-3.0-or-later (',
    label: 'see the licence',
    after: "). Any copyright in the site's own text and images is reserved, unless noted otherwise.",
  },
  ownership: 'IronAFS™ and the IronAFS logo are trademarks of Adrian Ana.',
  notice: 'AFS is the Andrew File System. IronAFS is an independent project, not affiliated with or endorsed by IBM or the OpenAFS Foundation. Other trademarks belong to their respective owners.',
} satisfies Footer;

export const notFound = {
  title: 'Page not found',
  pageTitle: 'Page not found · IronAFS',
  body: 'There is nothing at this address.',
  home: 'Back to IronAFS',
};
