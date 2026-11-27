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
  approval: string;
  approvalDetail: string;
  independence: string;
  risk: string;
  example: {
    kicker: string;
    heading: string;
    steps: { heading: string; body: string; link: Link }[];
  };
  classes: {
    heading: string;
    lead: string;
    change: string;
    gates: string;
    rows: { code: string; name: string; example: string; gates: string[] }[];
    link: Link;
  };
  families: {
    heading: string;
    lead: string;
    familyRole: string;
    mainModels: string;
    rows: { family: string; role: string; models: { name: string; detail?: string }[] }[];
    links: Link[];
  };
  provenance: {
    heading: string;
    code: { heading: string; body: string; links: Link[] };
    attribution: {
      heading: string;
      body: string;
      dco: string;
      caption: string;
      trailerLabel: string;
      trailers: { name: string; value: string }[];
      link: Link;
    };
  };
};
export type Footer = {
  onPage: string;
  homepage: string;
  policies: string;
  copyright: string;
  author: Link;
  software: string;
  licences: Link[];
  sharedLicence: string;
  reserved: string;
  ownership: string;
  notice: string;
};

export type StatId = 'crowdstrike' | 'stop-errors' | 'android-share' | 'android-density';
export type Stat = { id: StatId; value: string; what: string; source: Link; note?: string };
export type IllustrationId = 'debian' | 'dots';
export type Side = 't' | 'b' | 'l' | 'r';
/** [from box id, side, to box id, side, label on the line, '' or 'net' (the green line to the cells)]. */
export type Wire = [from: string, fromSide: Side, to: string, toSide: Side, label: string, kind: '' | 'net'];
export type SectionHead = { eyebrow: string; heading: string };

/** A #cost card's text column. */
export type CostCard = { os: string; heading: string; lede: string; context?: string; sources: Link[] };

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
  evidence?: Link;
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
  cost: SectionHead & {
    windows: CostCard & {
      signing: string;
      steps: string[];
      testing: { title: string; before: string; link: Link; after: string };
    };
    macos: CostCard & {
      platform: string;
      dialog: { title: string; label: string; full: string; reduced: string; allow: string };
      steps: string[];
    };
    linux: CostCard & {
      workflow: { title: string; label: string; lines: { text: string; note?: boolean }[]; failure: string };
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
    follow: { label: string; title: string; href: string; links: Link[] };
  };
};
