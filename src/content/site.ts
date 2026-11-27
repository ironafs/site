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

const fileReadCommit = '2f059608ebce7cbf3a4794437e2dd16420c6f00c';
const fileReadCommitUrl = `https://github.com/ironafs/site/commit/${fileReadCommit}`;

export const built: Built = {
  eyebrow: 'built',
  heading: 'How IronAFS is built',
  approval: 'One maintainer approves every change.',
  approvalDetail: 'Adrian Ana reviews the diff and the exact commit message before it goes into `main`.',
  independence: 'AI models help write and review changes. Required AI reviews come from model families independent of both the design and the implementation.',
  risk: 'The review and testing requirements depend on what could go wrong.',
  example: {
    kicker: 'A change to this website',
    heading: 'Where a file read spends time',
    steps: [
      {
        heading: 'Write the contract',
        body: 'Define the two read paths and when the diagram holds during scrolling.',
        link: { label: 'Read the contract', href: 'https://github.com/ironafs/site/issues/3' },
      },
      {
        heading: 'Review the design and code',
        body: 'Claude flagged an ambiguous viewport cutoff and later reviewed Codex’s implementation.',
        link: { label: 'See the pull request', href: 'https://github.com/ironafs/site/pull/4' },
      },
      {
        heading: 'Approve and merge',
        body: 'The maintainer signed off. The merged commit records the model contributions and review.',
        link: { label: 'View the merged commit', href: fileReadCommitUrl },
      },
    ],
  },
  classes: {
    heading: 'Review requirements by change class',
    lead: 'A change takes the class that matches the most serious plausible mistake. It waits if the required independent reviewers are unavailable.',
    change: 'Change',
    gates: 'Before merge',
    rows: [
      {
        code: 'E', name: 'Editorial',
        example: 'Fix a typo or broken link while preserving the project’s claims and behaviour.',
        gates: ['The maintainer re-reads the change.', 'Check that the links resolve.'],
      },
      {
        code: 'I', name: 'Internal',
        example: 'Refactor code or add tests while preserving inputs, outputs and stored data.',
        gates: ['Get one independent code review.', 'Run tests and lints.'],
      },
      {
        code: 'P', name: 'Public',
        example: 'Add an `afs` command or change an error message that users see.',
        gates: [
          'Have an independent family review the written contract before coding.',
          'Get an independent code review and pass tests and lints.',
        ],
      },
      {
        code: 'S', name: 'Safety',
        example: 'Change how the client parses fileserver replies, stores tokens, or invalidates cached data.',
        gates: [
          'Have an independent family review the design before coding.',
          'Get a code review. Tokens, protocol traffic, and cache coherency also require a second family.',
          'Get a separate security review and reproduce the failure in a test.',
          'Pass tests and lints.',
        ],
      },
      {
        code: 'R', name: 'Irreversible',
        example: 'Make a first public release, change the licence, or promise to keep reading an on-disk format.',
        gates: ['Meet all Safety requirements.', 'Get the owner’s decision on the commitment.'],
      },
    ],
    link: { label: 'Read the full workflow', href: links.workflow },
  },
  families: {
    heading: 'AI models and their roles',
    lead: 'In reviews of the project’s first commit, GPT, GLM, Gemini and Claude Mythos each found issues the others missed.',
    familyRole: 'Family and role',
    mainModels: 'Main models',
    rows: [
      {
        family: 'Anthropic',
        role: 'Plans the work, checks findings, writes most of the code, and reviews changes.',
        models: [
          { name: 'Claude Opus 5.5', detail: 'Default' },
          { name: 'Claude Mythos 5.2', detail: 'Most demanding design, judgement, and security reviews' },
        ],
      },
      {
        family: 'OpenAI',
        role: 'Helps implement changes. Also handles read-only design, research, judgements, and reviews.',
        models: [
          { name: 'GPT-6.2 Sol', detail: 'Default via Codex' },
          { name: 'GPT-6.2 Astra', detail: 'Most demanding design, judgement, and security reviews' },
        ],
      },
      {
        family: 'Zhipu',
        role: 'Usually does the first code review.',
        models: [
          { name: 'GLM 5.4', detail: 'High- and max-effort reviews' },
          { name: 'GLM 5.3 Flash', detail: 'Small helper steps' },
        ],
      },
      {
        family: 'Google',
        role: 'Provides second-family and security reviews. Implements changes when Codex is out of quota.',
        models: [{ name: 'Gemini 4 Carbon', detail: 'Via Antigravity' }],
      },
      {
        family: 'DeepSeek',
        role: 'Research and second-family reviews.',
        models: [{ name: 'DeepSeek V4.1 Flash' }],
      },
    ],
    links: [
      { label: 'Model routing and attribution in AI.md', href: links.ai },
      { label: 'Public review records', href: links.reviews },
    ],
  },
  provenance: {
    heading: 'Code provenance and commit attribution',
    code: {
      heading: 'Where the code comes from',
      body: 'IronAFS’s AFS and Rx code is written independently. Permissively licensed third-party material keeps its notices and gets an entry in the provenance log.',
      links: [
        { label: 'Source policy (ADR 0001)', href: links.adr0001 },
        { label: 'Provenance log', href: links.provenance },
      ],
    },
    attribution: {
      heading: 'How a commit gives credit',
      body: 'Human contributors are the authors. Commit trailers record which models contributed text or code and which reviews covered the change.',
      dco: 'A human’s `Signed-off-by` certifies their right to contribute under the Developer Certificate of Origin (DCO).',
      caption: `From the file-read commit \`${fileReadCommit.slice(0, 7)}\``,
      trailerLabel: 'Commit trailer excerpt',
      trailers: [
        { name: 'Class', value: 'P' },
        { name: 'Assisted-by', value: 'codex:gpt-6.2-sol' },
        { name: 'AI-Reviewed-by', value: 'claude-code:claude-opus-5-5' },
      ],
      link: { label: 'View the full commit', href: fileReadCommitUrl },
    },
  },
};

export const follow = {
  eyebrow: 'follow',
  heading: 'Follow IronAFS',
  intro: 'The first read-only Linux client is in development. Use',
  watch: 'Watch',
  watchDetail: 'on the GitHub repository to get updates.',
  primary: { label: 'Open on GitHub', href: links.github },
  resources: [
    { label: 'Track milestones', description: 'See what’s in progress and what’s planned.', href: links.milestones },
    { label: 'Read the design docs', description: 'Explore the architecture decisions and protocol specs.', href: links.docs },
  ],
};

export const footer = {
  onPage: 'On this page',
  homepage: 'On the homepage',
  policies: 'Site policies',
  copyright: '© 2026',
  author: { label: site.author, href: links.author },
  software: 'Software licences',
  licences: [
    { label: 'IronAFS code', href: links.licence },
    { label: 'Website code', href: links.siteLicensing },
  ],
  sharedLicence: `Both use ${site.ironafsLicence}.`,
  reserved: 'Any copyright in the site’s own text and images is reserved, unless noted otherwise.',
  ownership: 'IronAFS™ and the IronAFS logo are trademarks of Adrian Ana.',
  notice: 'AFS is the Andrew File System. IronAFS is an independent project, not affiliated with or endorsed by IBM or the OpenAFS Foundation. Other trademarks belong to their respective owners.',
} satisfies Footer;

export const notFound = {
  title: 'Page not found',
  pageTitle: 'Page not found · IronAFS',
  body: 'There is nothing at this address.',
  home: 'Back to IronAFS',
};
