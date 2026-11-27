import { googleRust2025, repo } from '../data/links.ts';

const decoder = `${repo}/blob/c6c0bf97e67c70b41f908e5bfdbab290addc48e2/crates/ironafs-xdr/src/decode`;
const declaredLength = 5;
const fieldBytes = ['01', '02'];

export const rust = {
  heading: { before: 'Why ', accent: 'Rust', after: ' for a ', tail: 'network file system?' },
  rationale: 'An AFS client has to decode bytes from a server. IronAFS is building one shared core to do that in safe Rust.',
  safety: {
    lead: 'Safe Rust checks buffer bounds and prevents references from outliving their data.',
    rest: 'C and C++ permit unchecked access. A mistake can expose data or corrupt memory.',
  },
  example: 'The IronAFS decoder also checks whether a reply contains the bytes it declares. This test shows how it rejects an incomplete field.',
  fixture: {
    label: 'XDR decoder · regression test',
    heading: 'An incomplete binary field',
    declared: { value: `${declaredLength} bytes`, label: 'Length declared' },
    available: { value: `${fieldBytes.length} bytes`, label: 'Field data available' },
    lengthPrefix: { label: 'Length prefix', start: '00 00 00', end: '05' },
    field: {
      label: 'Field data',
      description: 'Two bytes present, three bytes missing',
      bytes: fieldBytes,
      missing: declaredLength - fieldBytes.length,
    },
    result: '`Truncated` · Rejected before reserving an output buffer.',
    sources: [
      { label: 'View regression test', href: `${decoder}/tests.rs#L323-L332` },
      { label: 'View decoder checks', href: `${decoder}.rs#L643-L688` },
    ],
  },
  ownership: {
    summary: 'Ownership and concurrent reads',
    text: 'Rust manages memory through ownership, without a garbage collector. Safe Rust also prevents data races when threads share memory, which matters when a file client handles overlapping requests.',
    sources: [
      { label: 'Rust ownership and borrowing', href: 'https://doc.rust-lang.org/book/ch04-00-understanding-ownership.html' },
      { label: 'Buffer bounds', href: 'https://doc.rust-lang.org/reference/expressions/array-expr.html#array-and-slice-indexing-expressions' },
    ],
  },
  platformDetail: 'The planned macOS file-system extension uses Swift, and the daemon will use one C file for system logging.',
  name: 'Iron and the rust it forms give IronAFS its name.',
  evidence: {
    heading: 'What Google measured on Android',
    lede: 'Android’s production data gives context for IronAFS’s choice of a memory-safe language.',
    label: 'Android security',
  },
  share: {
    id: 'android-share',
    heading: 'Memory-safety share',
    unit: 'Percentage of all reported Android vulnerabilities',
    chartLabel: 'Reported share by year',
    ticks: [75, 50, 25, 0],
    points: [
      { year: '2019', value: '76%', height: 76 },
      { year: '2022', value: '35%', height: 35 },
      { year: '2024', value: '24%', height: 24 },
      { year: '2025', value: '<20%', height: 20, upperBound: 'below 20%' },
    ],
    bound: 'Hatching shows the 2025 upper bound.',
    sourceLabel: 'Google reports',
    sources: [
      { label: '2022', name: 'Google’s 2022 Android security report', href: 'https://security.googleblog.com/2022/12/memory-safe-languages-in-android-13.html' },
      { label: '2024', name: 'Google’s 2024 Android security report', href: 'https://security.googleblog.com/2024/09/eliminating-memory-safety-vulnerabilities-Android.html' },
      { label: '2025', name: 'Google’s 2025 Android security report', href: googleRust2025 },
    ],
  },
  density: {
    id: 'android-density',
    heading: 'Memory-safety density',
    unit: 'Estimated vulnerabilities per million lines of Android code',
    illustration: 'Illustrative scale',
    cLabel: 'Historical C and C++',
    cValue: '≈ 1,000',
    rustLabel: 'Rust',
    rustValue: '0.2',
    limit: 'The code differs in age and role.',
    methodology: 'These figures don’t measure IronAFS. For Rust, Google counted one potential vulnerability in about 5 million lines, found and fixed before release.',
    source: { label: 'Google, 2025', href: googleRust2025 },
    transition: 'Google also estimates how often these vulnerabilities occur per million lines of Android code.',
  },
  engineering: {
    summary: 'Code review and rollbacks on Android',
    text: 'In Google’s own Android platform code, Rust changes spent about 25% less time in review than C++ changes. Among medium and large changes, the Rust rollback rate was about a quarter of the C++ rate.',
    source: { label: 'Google’s 2025 report', href: googleRust2025 },
  },
};

export const rustCards = {
  heading: 'File permissions and cached data',
  lede: 'Memory-safe decoding is one part of the design. IronAFS’s shared core also has to enforce each caller’s permissions and keep cached data current across platforms.',
  rules: [
    { term: 'Permissions', description: 'Apply the requesting user’s AFS permissions, even when the file is already cached.' },
    { term: 'Cached copies', description: 'When a fileserver invalidates cached data, the client tells the operating system to discard its copy.' },
  ],
  source: { label: 'IronAFS architecture', href: `${repo}/blob/main/docs/adr/0004-architecture-1-core.md#c2-semantics-in-the-core-presentation-in-the-layer` },
  referenceLabel: 'Rust implementation context',
  mountpoint: {
    heading: 'Rust and FUSE on Linux',
    text: 'Mountpoint for Amazon S3 uses Rust and FUSE to expose S3 objects as files on Linux. IronAFS plans to use Rust and FUSE for its Linux AFS client.',
    source: { label: 'Mountpoint on GitHub', href: 'https://github.com/awslabs/mountpoint-s3' },
  },
  unsafe: {
    heading: 'Unsafe Rust at the OS boundary',
    text: 'IronAFS limits its own `unsafe` Rust to named sites in its OS bindings. Changes to those sites require a security review.',
    source: { label: 'Unsafe-code rules', href: `${repo}/blob/main/docs/adr/0005-ironafs-os.md#6-what-every-site-requires` },
    example: {
      summary: 'Linux Binder example',
      text: 'A race in unsafe code in the Linux kernel’s Rust Binder driver could cause a crash.',
      source: { label: 'CVE-2025-68260', href: 'https://www.cve.org/CVERecord?id=CVE-2025-68260' },
    },
  },
};
