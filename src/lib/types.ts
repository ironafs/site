export type ConsoleLine = { cls: 'r' | 'c' | 'a'; prefix: string; text: string; note?: string; cps: number; pauseAfterMs: number };

export type Link = { label: string; href: string };
export type NavItem = Link;
export type Site = {
  name: string;
  author: string;
  url: string;
  title: string;
  identity: string;
  tagline: string;
  headline: string;
  subline: string;
  ogImage: string;
  ironafsLicence: string;
};
type NamedSection = { eyebrow: string; heading: string };
export type Built = NamedSection & {
  intro: string;
  families: { head: [string, string, string]; rows: [string, string, string][] };
  classes: { heading: string; lead: string; head: [string, string, string, string]; rows: [string, string, string, string][] };
  waits: string;
  provenance: string;
  human: string;
  humanBody: string;
  links: Link[];
};
export type Footer = {
  copyright: string;
  licence: string;
  siteLicence: { before: string; label: string; after: string };
  ownership: string;
  built: string;
  notice: string;
  site: string;
  project: string;
  author: Link[];
};

export type StatId = 'crowdstrike' | 'stop-errors' | 'android-share' | 'android-density' | 'android-rollback' | 'android-review';
export type Stat = { id: StatId; value: string; what: string; source: Link; note?: string };
export type IllustrationId = 'debian' | 'dots';
export type Side = 't' | 'b' | 'l' | 'r';
/** [from box id, side, to box id, side, label on the line, '' or 'net' (the green line to the cells)]. */
export type Wire = [from: string, fromSide: Side, to: string, toSide: Side, label: string, kind: '' | 'net'];
export type SectionHead = { eyebrow: string; heading: string };
/** A sourced example in the Rust panel. */
export type FactCard = { kicker: string; text: string; source: Link };

/** A #cost card's text column. */
export type CostCard = { os: string; heading: string; lede: string; foot: string };

/** A #platforms lane: the three platforms; IronAFS closes the timeline on its own. */
export type Lane = 'linux' | 'macos' | 'windows' | 'ironafs';
/** An event on the #platforms timeline. `href` is its primary source (docs/sources/os-timeline.md); an event that
 *  states a second fact links that fact's source in `sources`. */
export type TimelineEvent = {
  lane: Lane;
  /** YYYY-MM, or YYYY (its January): where the marker sits (timeline.ts, xFor). */
  date: string;
  label: string;
  title: string;
  text: string;
  href: string;
  sources?: Link[];
};

export type OsHow = {
  os: 'linux' | 'macos' | 'windows';
  tab: string;
  headline: string;
  lede: string;
  /** The h3 above the points. */
  subhead: string;
  points: { lead: string; text: string }[];
  details: string[];
  /** The ADR references (and qualifications) that open the cite line. */
  cite: string;
  /** The status shown beside the cite and in the diagram. */
  status: string;
  /** Box ids, stable: the `.nd` ids the wires name. */
  ids: { programs: string; kernel: string; layer?: string; daemon: string; cells: string };
  programs: string;
  kernel: { title: string; sub: string; chips: string[] };
  /** The platform layer: Linux's sits inside ironafsd (no tag), the others are their own process. */
  layer?: { name: string; sub: string; tag?: string };
  /** The daemon's sub-line where it differs from `how.diagram.daemon.sub`. */
  daemonSub?: string;
  wires: Wire[];
};

export type Story = {
  crash: SectionHead & {
    message: string;
    progressSuffix: string;
    stopCode: string;
    labels: { stopCode: string };
    note: string;
  };
  numbers: SectionHead & { stats: Stat[] };
  how: SectionHead & {
    /** The line under the eyebrow. */
    note: string;
    tablistLabel: string;
    /** The pinned layout's step counter: `${stepLabel} 2 ${stepOf} 4`. */
    stepLabel: string;
    stepOf: string;
    scrollCue: string;
    /** The summary of each OS's <details>. */
    detailsLabel: string;
    /** Strings every OS diagram shares. */
    diagram: {
      userSpace: string;
      /** The title of the programs box; each OS names its own programs below it. */
      programs: string;
      kernel: string;
      kernelNote: string;
      daemon: { tag: string; name: string; sub: string };
      core: { title: string; chips: string[] };
      cells: string;
    };
    os: OsHow[];
  };
  rust: SectionHead & {
    /** The large word (the CSS word, and 3D word); also its text for assistive technology. */
    word: string;
    /** The line on the name under the word: iron, its oxide, and the language. */
    name: string;
    /** The claim under the word; `highlight` is set in rust orange. Future tense: there is no client yet. */
    claim: { before: string; highlight: string; after: string };
    /** Phase 1 (bars): the section heading is its heading. `bars` in the chart's order; `height` is the bar's
     *  height in percent (a class `h-<height>` in rust.css). The caption names its sources after `sourcesLead`. */
    share: {
      id: Extract<StatId, 'android-share'>;
      lede: string;
      bars: { year: string; value: string; height: number; threshold?: boolean }[];
      what: string;
      sourcesLead: string;
      sources: Link[];
    };
    /** Phase 2 (density): `value` is Rust's figure, `what` the panel's label, `note` closes the source line. */
    density: Stat & {
      heading: string;
      lede: string;
      cLabel: string;
      cValue: string;
      rustLabel: string;
      illustration: string;
      sourceLead: string;
    };
    /** The two chips. `what` is the chip's text; `value` is the figure it states (not shown on its own). */
    chips: Stat[];
  };
  cards: SectionHead & {
    mountpoint: FactCard;
    unsafeCard: FactCard;
  };
  cost: SectionHead & {
    /** The four stacked cards, in order. Each card's `os` label, heading, lede and source line (`foot`). */
    windows: CostCard & {
      /** The signing steps, lit in turn, with an alternate branch and the 2026 warning. */
      steps: { mark?: string; text: string; branch?: boolean; warn?: boolean }[];
    };
    macos: CostCard & {
      /** The security-policy schematic: Full switches to Reduced, then the box ticks. */
      dialog: { title: string; full: string; reduced: string; allow: string; cancel: string; ok: string };
      /** The steps under it, in the order they are taken (the dialog switches between the second and third). */
      steps: string[];
    };
    linux: CostCard & {
      /** The Debian workflow: the numbered steps and the unnumbered failure branch. */
      workflow: { label: string; lines: { n?: string; text: string; tone?: 'error' | 'dim' }[] };
    };
    ironafs: CostCard & {
      /** `$ afs status` types itself, then the status output appears. */
      prompt: string;
      command: string;
      output: { ok: string; design: string };
    };
  };
  platforms: SectionHead & {
    /** The three lanes, in order (shown in capitals on the desktop track). */
    lanes: { id: Exclude<Lane, 'ironafs'>; name: string }[];
    /** The lanes' events, each lane in date order, then IronAFS: the reading order of the list. */
    events: TimelineEvent[];
  };
  speed: SectionHead & {
    lede: string;
    read: {
      label: string;
      heading: string;
      controlsLabel: string;
      stepsLabel: string;
      steps: { title: string; text: string }[];
      reply: { title: string; text: string };
      scope: string;
      paths: Record<'cache' | 'server', { control: string; node: string; location: string; title: string; text: string }>;
    };
    choices: { title: string; text: string }[];
    sources: Link[];
    measurements: {
      heading: string;
      counted: { title: string; text: string; targetBefore: string; target: string; targetAfter: string };
      timed: { title: string; text: string };
      source: Link;
    };
    study: { summary: string; text: string; source: Link };
  };
  statusSection: SectionHead & {
    lede: string;
    nowLabel: string;
    nextLabel: string;
    follow: { label: string; title: string; links: Link[] };
    buttons: Link[];
  };
};
