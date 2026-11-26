import { adr0004, googleRust2025, links, repo } from '../data/links.ts';
import type { Story } from '../lib/types';

export const pill = {
  none: 'IronAFS™ · planned · design phase',
  m1: 'IronAFS™ · architecture accepted',
  nowPrefix: 'IronAFS™ · building ',
  closedPrefix: 'IronAFS™ · milestone closed · ',
  progressPrefix: 'IronAFS™ · in progress: ',
  display: {
    M2a: { title: 'M2a: core and Linux, read-only', label: 'core and read-only Linux client' },
  } as Record<string, { title: string; label: string }>,
};

/**
 * The now/next cards' bodies, keyed by milestone code. The card title is GitHub's milestone title.
 * The plan follows ADR 0004 O50 and makes no schedule promises.
 */
export const milestoneCopy: Record<string, { body: string }> = {
  M1: { body: 'Accepted on 20 November 2026 as ADR 0004.' },
  M2a: { body: "The core and a read-only Linux client over FUSE. It's tested in a simulator and against a real OpenAFS cell, reading without signing in. A small Windows test of SMB user identity runs alongside." },
  M2b: { body: 'Signing in on Linux with rxkad tokens and aklog, tested across users and for revoked access. It depends on a written description of rxkad to build from, because no public specification has been found.' },
  M3: { body: "File writes on Linux, along with ACLs, mount points, locks and quotas. afs pending lists writes that haven't reached the server yet." },
  M4: { body: 'The FSKit tests come first, then a mount for each user and a signed, notarised installer. Writing follows only if tests show that failed saves are reported and recoverable.' },
  M5: { body: 'The rest of the Windows tests come first. Then an SMB server reachable only from the same machine, and an MSI installer, for Windows setups that pass.' },
  M6: { body: 'rxgk, a newer AFS security protocol, after the Windows layer, tested against an independently written simulator.' },
  M7: { body: 'Ideas recorded in the architecture. Each is scheduled only if its issue is approved.' },
};

export const story = {
  // The crash screen and the diagram's section carry no section eyebrow or heading: empty
  // strings, which a placeholder leaves out (#design's headings are the per-OS headlines).
  crash: {
    eyebrow: '',
    heading: '',
    message: 'Your device ran into a problem and needs to restart.',
    progressSuffix: '% complete',
    stopCode: 'PAGE_FAULT_IN_NONPAGED_AREA (0x50)',
    labels: { stopCode: 'Stop code:' },
    note: 'A fault in kernel code takes the whole machine down with it.',
  },

  numbers: {
    eyebrow: '/why · one fault, the whole machine',
    heading: 'Driver failures in numbers.',
    stats: [
      {
        id: 'crowdstrike',
        value: '≈8.5M',
        what: "Windows devices affected by the CrowdStrike outage of 19 July 2024, by Microsoft's estimate. A faulty content update crashed a kernel driver.",
        source: { label: 'Microsoft, July 2024', href: 'https://blogs.microsoft.com/blog/2024/07/20/helping-our-customers-through-the-crowdstrike-outage/' },
        note: "CrowdStrike's post-incident review",
      },
      {
        id: 'stop-errors',
        value: '70%',
        what: "of Windows stop errors in Microsoft's published analysis were attributed to third-party driver code.",
        source: {
          label: "Microsoft's root-cause analysis of crashes · Microsoft Learn · date of the analysis not given",
          href: 'https://learn.microsoft.com/en-us/troubleshoot/windows-client/performance/stop-error-or-blue-screen-error-troubleshooting',
        },
      },
    ],
  },

  how: {
    eyebrow: '/design · how it works',
    heading: '',
    note: 'the accepted design · process names are working names · no working client yet',
    tablistLabel: 'Operating system',
    stepLabel: 'step',
    stepOf: 'of',
    scrollCue: 'Scroll or choose a platform',
    detailsLabel: 'Details for administrators',
    diagram: {
      userSpace: 'USER SPACE',
      programs: 'Your programs',
      kernel: 'KERNEL',
      kernelNote: "below this line: only your operating system's own code",
      daemon: { tag: 'one process', name: 'ironafsd', sub: 'the IronAFS daemon' },
      core: { title: 'IronAFS core · Rust', chips: ['Rx', 'protocol clients', 'cache', 'tokens'] },
      cells: 'AFS servers',
    },
    os: [
      {
        os: 'linux',
        tab: 'Linux',
        headline: 'Linux gets `/afs` first.',
        lede: "Linux's FUSE module will hand each file request straight to `ironafsd`, the IronAFS daemon, written in Rust. No libfuse, no kernel module.",
        subhead: 'Linux · inside one daemon',
        points: [
          { lead: 'Mounting is its own small step.', text: 'A small privileged unit mounts `/afs`; the daemon runs sandboxed under its own unprivileged account.' },
          { lead: "Lookups aren't shared between users.", text: "Entry and attribute timeouts start at zero, so the kernel asks again instead of reusing one user's answer for another." },
          { lead: 'A stopped daemon gives errors, not wrong files.', text: 'The dead mount returns errors until a replacement is ready.' },
        ],
        details: [
          "The mount unit sets `allow_other,nosuid,nodev` and hands `/dev/fuse` to the daemon, which speaks the kernel's FUSE protocol directly (7.23 or later). No setuid helper, and no change to the system's FUSE configuration.",
          'Reads and writes use direct I/O, which skips the shared page cache. Memory-mapped files get their own tests on each supported kernel. A cache setting is relaxed only after tests show users stay isolated and data stays fresh after a server change, on every tier 1 kernel. The FUSE writeback cache is never used.',
          'When the daemon is replaced, open files and working directories stay on the old mount. During the gap, only root or a process that bypasses file permissions can see the empty mount directory.',
          'M2a is read-only and unauthenticated; writes come in M3.',
        ],
        cite: 'ADR 0004 L2, L4, L5, L7, C15',
        status: 'In progress · M2a: read-only, unauthenticated',
        ids: { programs: 'sc-l-prog', kernel: 'sc-l-os', layer: 'sc-l-layer', daemon: 'sc-l-daemon', cells: 'sc-l-cells' },
        programs: 'terminal · editors · builds',
        kernel: { title: 'Linux kernel', sub: 'VFS + FUSE', chips: [] },
        layer: { name: 'FUSE layer', sub: "the kernel's FUSE protocol, in IronAFS's own Rust" },
        daemonSub: 'the IronAFS daemon · unprivileged, sandboxed',
        wires: [
          ['sc-l-prog', 'b', 'sc-l-os', 't', 'a system call', ''],
          ['sc-l-os', 't', 'sc-l-layer', 'b', '/dev/fuse · from the mount step', ''],
          ['sc-l-daemon', 'r', 'sc-l-cells', 'l', 'Rx over UDP', 'net'],
        ],
      },
      {
        os: 'macos',
        tab: 'macOS',
        headline: "On a Mac, Apple's FSKit carries the request.",
        lede: "macOS 27 lets FSKit tell a file system who is asking, for some operations, and lets it switch off the kernel's data cache. IronAFS is designed around both, with tests to pass first.",
        subhead: 'macOS · an FSKit extension',
        points: [
          { lead: 'A thin Swift extension.', text: 'It runs in its own sandboxed process and forwards each request to `ironafsd`. It holds no AFS logic, cached file data or tokens.' },
          { lead: 'One mount per user.', text: "FSKit reads and writes don't say who is calling, so by default each user gets their own mount." },
          { lead: 'A signed, notarised installer.', text: 'An administrator approves the IronAFS daemon, or device management approves it in advance.' },
        ],
        details: [
          "FSKit passes the caller's real and effective user and group IDs to namespace operations and to the cache handler's open, close and upgrade calls. The daemon binds each mount to its owner; a shared mount would need proof that users stay isolated.",
          'The kernel data cache starts off for every file. The tests also cover memory-mapped files and what happens if the extension loses the daemon. The Mac client stays read-only unless applications can be shown to receive the write failures they wait for.',
          'Each user switches the extension on in System Settings. Whether device management can switch it on is still open.',
        ],
        cite: 'ADR 0004 C1, L1, L8–L14 (gate: L13)',
        status: 'Planned · M4 · L13 tests first · macOS 27, Apple silicon',
        ids: { programs: 'sc-m-prog', kernel: 'sc-m-os', layer: 'sc-m-layer', daemon: 'sc-m-daemon', cells: 'sc-m-cells' },
        programs: 'Finder · Terminal · Xcode',
        kernel: { title: 'macOS kernel', sub: "the kernel's VFS passes the request up to Apple's FSKit", chips: ['VFS'] },
        layer: { name: 'FSKit extension', sub: 'a thin Swift extension · sandboxed · no cache or tokens', tag: 'own process' },
        wires: [
          ['sc-m-prog', 'b', 'sc-m-os', 't', 'a system call', ''],
          ['sc-m-os', 't', 'sc-m-layer', 'b', 'FSKit · per-user mount', ''],
          ['sc-m-layer', 'r', 'sc-m-daemon', 'l', 'local IPC', ''],
          ['sc-m-daemon', 'r', 'sc-m-cells', 'l', 'Rx over UDP', 'net'],
        ],
      },
      {
        os: 'windows',
        tab: 'Windows',
        headline: 'On Windows, IronAFS answers over SMB on the same PC.',
        lede: 'Windows already has an SMB client. If testing passes, it will talk to a small SMB 3.1.1 server from IronAFS on the same machine, with no driver added.',
        subhead: 'Windows · a local SMB server of its own',
        points: [
          { lead: 'The traffic stays on the PC.', text: "IronAFS uses `\\\\afs` only where tests show a sign-in under that name can't leave the machine; elsewhere it uses `\\\\127.0.0.1` through a mapped drive or shortcut." },
          { lead: 'Your Windows sign-in decides.', text: 'The same IronAFS core as on Linux checks access for the account and logon session that SMB authenticated.' },
          { lead: 'First packet only, so far.', text: "On Windows 10 22H2, Windows 11 24H2 and 26H2, the built-in client sent its first packet to a local listener. A full SMB session hasn't been tested yet." },
        ],
        details: [
          "The server is written from Microsoft's open specifications and captures from target Windows builds. It accepts only authenticated, signed SMB 3.1.1 sessions; guest, anonymous and unsigned sessions are refused.",
          '`ironafs-smbd` runs as its own process. It holds the keys for active SMB sessions, but no AFS tokens or file cache; `ironafsd` checks the sign-in through Windows.',
          'The server declines leases and oplocks and marks shares for no offline caching, so Windows keeps no stale copies of its own.',
          "Tests check that no other program can take the ports, that Windows file sharing still works, and that applications see fresh data. Where local SMB doesn't qualify, it doesn't ship; a Cloud Files route is the gated alternative.",
        ],
        cite: 'ADR 0004 L15, L17–L20, L22, L41',
        status: 'Planned · M5 · SMB where it qualifies',
        ids: { programs: 'sc-w-prog', kernel: 'sc-w-os', layer: 'sc-w-layer', daemon: 'sc-w-daemon', cells: 'sc-w-cells' },
        programs: 'File Explorer · Office · Visual Studio',
        kernel: { title: "Windows' own SMB client", sub: 'reaches IronAFS on the same PC', chips: [] },
        layer: { name: 'ironafs-smbd', sub: 'SMB front end · no AFS tokens, no file cache', tag: 'own process' },
        wires: [
          ['sc-w-prog', 'b', 'sc-w-os', 't', 'a UNC path', ''],
          ['sc-w-os', 't', 'sc-w-layer', 'b', 'signed SMB 3.1.1 · loopback', ''],
          ['sc-w-layer', 'r', 'sc-w-daemon', 'l', 'local IPC', ''],
          ['sc-w-daemon', 'r', 'sc-w-cells', 'l', 'Rx over UDP', 'net'],
        ],
      },
    ],
  },

  // The Rust section has no eyebrow.
  rust: {
    eyebrow: '',
    heading: 'Why Rust for a network file system?',
    word: 'Rust',
    name: 'Iron and the rust it forms give IronAFS its name.',
    claim: {
      before: 'IronAFS is being written in ',
      highlight: 'Rust',
      after: ", from the core to the `afs` command. On macOS the file-system extension is planned in Swift, and the daemon will use one C file for system logging. A file-system client can't assume server replies are well formed, and safe Rust keeps a parser from reading outside its buffers.",
    },
    share: {
      id: 'android-share',
      lede: "Google reports that memory-safety bugs made up 76% of Android's reported vulnerabilities in 2019 and less than 20% in 2025.",
      bars: [
        { year: '2019', value: '76%', height: 76 },
        { year: '2022', value: '35%', height: 35 },
        { year: '2024', value: '24%', height: 24 },
        { year: '2025', value: '<20%', height: 20, threshold: true },
      ],
      what: 'Memory-safety bugs, share of all Android vulnerabilities',
      sourcesLead: 'Google',
      sources: [
        { label: '2022', href: 'https://security.googleblog.com/2022/12/memory-safe-languages-in-android-13.html' },
        { label: '2024', href: 'https://security.googleblog.com/2024/09/eliminating-memory-safety-vulnerabilities-Android.html' },
        { label: '2025 ("below 20%")', href: googleRust2025 },
      ],
    },
    density: {
      id: 'android-density',
      heading: 'Memory-safety bugs per million lines',
      lede: "Google estimates about 0.2 memory-safety vulnerabilities per million lines of Android Rust, against roughly 1,000 in its historical C and C++. The code differs in age and role: these figures don't measure IronAFS. IronAFS's own unsafe code is confined to a few named sites in one crate, and any change to them needs a security review.",
      what: 'memory-safety vulnerabilities per million lines of code · Android',
      cLabel: 'C and C++',
      cValue: '≈ 1,000',
      rustLabel: 'Rust',
      value: '0.2',
      illustration: 'Illustration: about 1,000 dots against a fifth of one.',
      sourceLead: 'Android code · estimated Rust density against historical C and C++ density',
      source: { label: 'Google, 2025', href: googleRust2025 },
      note: 'a conservative estimate: about 5 million lines of Rust, one potential vulnerability, found and fixed before release',
    },
    chips: [
      { id: 'android-rollback', value: '4×', what: 'Android Rust changes were rolled back about a quarter as often as C and C++ changes.', source: { label: 'Google, 2025', href: googleRust2025 } },
      { id: 'android-review', value: '25%', what: 'Android Rust changes took 25% less time to review.', source: { label: 'Google, 2025', href: googleRust2025 } },
    ],
  },
  cards: {
    eyebrow: '',
    heading: "What Rust can and can't do for a file client",
    mountpoint: {
      kicker: 'Another file client',
      text: "Amazon's Mountpoint for S3 is a file client written in Rust that uses FUSE.",
      source: { label: 'github.com/awslabs/mountpoint-s3', href: 'https://github.com/awslabs/mountpoint-s3' },
    },
    unsafeCard: {
      kicker: 'Still needs care',
      text: "A race in unsafe code in the Linux kernel's Rust Binder driver could cause a crash. Even in safe Rust, a file client still has to check that a server's reply makes sense.",
      source: { label: 'CVE-2025-68260', href: 'https://www.cve.org/CVERecord?id=CVE-2025-68260' },
    },
  },
  cost: {
    eyebrow: '/why · shipping kernel code',
    heading: 'Kernel code is hard to ship, and harder to run from your own build.',
    windows: {
      os: 'WINDOWS',
      heading: "A driver you build yourself won't load.",
      lede: "Windows loads a new kernel driver once Microsoft has signed it, which takes a company account in Microsoft's hardware program and an EV certificate. The only other way to run your own build is Test Mode: sign it with your own certificate, switch Secure Boot off and live with the watermark.",
      foot: 'Microsoft Learn · Windows release notes',
      steps: [
        { mark: '01', text: 'your build' },
        { mark: '02', text: 'company account + EV certificate' },
        { mark: '03', text: 'Microsoft signs it' },
        { text: 'or: your own certificate + Test Mode (Secure Boot off)', branch: true },
        { mark: '!', text: 'April 2026: old cross-signed drivers lose default trust (allow list)', warn: true },
      ],
    },
    macos: {
      os: 'MACOS · APPLE SILICON',
      heading: 'Third-party kexts need Reduced Security.',
      lede: "Before a kext can load, you start up in Recovery, lower the Mac to Reduced Security and enter an administrator password. Kexts run with the kernel's privileges, and Apple advises choosing software that doesn't need them.",
      foot: 'Apple Platform Deployment',
      dialog: {
        title: 'Security policy',
        full: 'Full Security',
        reduced: 'Reduced Security',
        allow: 'Allow user management of kernel extensions from identified developers',
        cancel: 'Cancel',
        ok: 'OK',
      },
      steps: ['shut down', 'Recovery', 'admin password', 'restart'],
    },
    linux: {
      os: 'LINUX',
      heading: 'A kernel update can mean a rebuild.',
      lede: 'Linux keeps no stable interface inside the kernel, so the functions a module relies on can change between releases. A module built outside the kernel tree may then need updating and retesting for each new kernel. With Secure Boot it must also be signed with a key the system trusts, which you enrol once at boot.',
      foot: 'Debian wiki · kernel docs',
      workflow: {
        label: 'Debian, DKMS and Secure Boot',
        lines: [
          { n: '1', text: 'a kernel update arrives' },
          { n: '2', text: 'DKMS rebuilds the module for the new kernel' },
          { text: 'if the module no longer builds, it waits for a fix', tone: 'error' },
          { n: '3', text: 'with Secure Boot: sign it with a trusted key' },
          { n: '4', text: 'a new key: reboot and confirm MOK enrolment', tone: 'dim' },
        ],
      },
    },
    ironafs: {
      os: 'IRONAFS',
      heading: 'IronAFS ships no kernel code.',
      lede: "There's nothing of IronAFS's to sign as a driver, allow in Recovery or rebuild for a new kernel. On Linux its file system reaches the kernel through FUSE, which the kernel keeps backward compatible for programs, so a new kernel rarely means IronAFS changes. On a Mac you'll still switch on its FSKit extension in System Settings and approve it.",
      foot: '',
      prompt: '$',
      command: 'afs status',
      output: {
        ok: 'ironafsd: not running yet · M2a in progress',
        design: 'planned: Linux first (FUSE), then macOS (FSKit), then Windows (SMB, if testing passes)',
      },
    },
  },
  platforms: {
    eyebrow: '/why · where the platforms are going',
    heading: 'Every platform now supports code outside the kernel.',
    lanes: [
      { id: 'linux', name: 'Linux' },
      { id: 'macos', name: 'macOS' },
      { id: 'windows', name: 'Windows' },
    ],
    events: [
      { lane: 'linux', date: '2005-10', label: '2005 · 2.6.14', title: 'FUSE', text: 'FUSE lets you implement filesystems in userspace.', href: 'https://kernelnewbies.org/Linux_2_6_14' },
      { lane: 'linux', date: '2024-05', label: '2024 · 6.9', title: 'FUSE passthrough', text: 'Eligible I/O goes straight to the backing file, bypassing the FUSE daemon.', href: 'https://kernelnewbies.org/Linux_6.9' },
      { lane: 'linux', date: '2025-03', label: '2025 · 6.14', title: 'FUSE over io_uring', text: 'FUSE adds an io_uring transport with per-CPU queues.', href: 'https://kernelnewbies.org/Linux_6.14' },
      { lane: 'linux', date: '2026-10', label: '2026 · 7.3', title: 'FUSE zero-copy', text: 'FUSE over io_uring can skip a data copy.', href: 'https://kernel.googlesource.com/pub/scm/linux/kernel/git/torvalds/linux/%2B/9cebfe6504488198b012e746bc6b313f88b95439' },

      { lane: 'macos', date: '2019-10', label: '2019 · Catalina', title: 'DriverKit', text: 'Supported drivers can run in user space.', href: 'https://developer.apple.com/videos/play/wwdc2019/702/' },
      { lane: 'macos', date: '2025-03', label: '2025 · 15.4', title: 'FSKit', text: 'App extensions can implement file systems in user space.', href: 'https://developer.apple.com/documentation/macos-release-notes/macos-15_4-release-notes' },
      { lane: 'macos', date: '2026-06', label: '2026 · macOS 27', title: 'FSKit caller identity', text: "FSKit exposes the caller's user and group IDs for selected operations.", href: 'https://developer.apple.com/documentation/updates/fskit' },

      { lane: 'windows', date: '2007', label: '2007 · Vista', title: 'User-mode drivers', text: 'UMDF lets some drivers run in user mode.', href: 'https://learn.microsoft.com/en-us/windows-hardware/drivers/wdf/umdf-version-history' },
      { lane: 'windows', date: '2017-10', label: '2017 · 1709', title: 'Cloud Files API', text: 'A user-mode sync provider hydrates placeholder files on demand.', href: 'https://learn.microsoft.com/en-us/windows/win32/cfapi/build-a-cloud-file-sync-engine' },
      { lane: 'windows', date: '2018-10', label: '2018 · 1809', title: 'ProjFS', text: 'A user-mode provider can project a file tree into a folder.', href: 'https://learn.microsoft.com/en-us/windows/win32/projfs/projfs-programming-guide' },
      { lane: 'windows', date: '2026-11', label: 'Nov 2026', title: 'Endpoint security platform', text: 'Security providers can move critical protections into user mode on Windows 11.', href: 'https://blogs.windows.com/windowsexperience/2026/11/17/windows-security-at-ignite-2026-start-secure-protect-what-matters-prepare-for-ai/' },

      { lane: 'ironafs', date: '2026-11', label: 'Nov 2026 · architecture accepted', title: 'IronAFS', text: 'The core and read-only Linux client are in development.', href: adr0004 },
    ],
  },
  speed: {
    eyebrow: '/design · performance',
    heading: 'Where a file read spends time',
    lede: 'A read can stay on your machine when IronAFS already has valid data and knows you can read it. We’ll measure the cost of local and network reads once the read-only Linux client is running.',
    read: {
      label: 'Illustration · planned Linux client',
      heading: 'Follow a Linux file read',
      controlsLabel: 'Choose a read scenario',
      stepsLabel: 'Read request through the local machine',
      steps: [
        { title: 'App', text: 'Read file' },
        { title: 'Linux FUSE', text: 'Forward read' },
        { title: 'IronAFS daemon', text: 'Check caller’s access' },
      ],
      reply: { title: 'Bytes back to the app', text: 'The daemon rechecks the caller’s grant before returning data.' },
      scope: 'Ordinary reads only. Renewing a read grant may still contact the server, even with the bytes cached.',
      paths: {
        cache: { control: 'Valid cached copy', node: 'Local cache', location: 'On this machine', title: 'This read stays local', text: 'The daemon has the requested bytes, a valid server callback, and a current read grant for this caller.' },
        server: { control: 'Fetch from server', node: 'AFS fileserver', location: 'Over the network', title: 'This read reaches the fileserver', text: 'The daemon asks the AFS fileserver for the requested bytes when they’re missing or stale.' },
      },
    },
    choices: [
      { title: 'Why lookups make more trips to the daemon', text: 'On Linux, IronAFS will start with the kernel’s lookup and attribute caches off so the daemon can check each user’s AFS rights. That means more daemon calls for work that looks up lots of files.' },
      { title: 'How IronAFS reduces waits', text: 'IronAFS will request file details in batches after a directory listing. It will also adjust how far ahead it fetches so sequential reads can have bytes ready sooner.' },
    ],
    sources: [
      { label: 'Linux cache design', href: `${repo}/blob/main/docs/adr/0004-architecture-2-os-layers.md#l5-linux-kernel-caches-start-off-and-relax-only-with-evidence` },
      { label: 'Read access design', href: `${repo}/blob/main/docs/adr/0004-architecture-1-core.md#c22-grants-per-file-from-the-readers-own-status-reply` },
      { label: 'Performance choices', href: `${repo}/blob/main/docs/adr/0004-architecture-1-core.md#c36-performance-choices-made-at-the-start` },
    ],
    measurements: {
      heading: 'How we’ll measure it',
      counted: { title: 'Count work in pull requests', text: 'Simulator tests will count calls for directory listings, packets per MiB at 1% packet loss, and bytes fetched after a restart with a warm cache.', targetBefore: 'The repeat-read test targets ', target: 'zero remote procedure calls', targetAfter: ' while the callback and read grant are valid.' },
      timed: { title: 'Time workloads on one machine', text: 'We’ll run timed benchmarks by hand first. Once dedicated hardware is available, we’ll run them nightly on that machine.' },
      source: { label: 'Benchmark plan', href: `${repo}/blob/main/docs/specs/testing.md#56-benchmarks` },
    },
    study: {
      summary: 'What the 2017 FUSE study found',
      text: 'Many workloads in the study were within 5% of native ext4 with an optimized FUSE layer. In one test that created small files on an SSD, throughput was about 83% lower. The study measured a local file system built on ext4.',
      source: { label: 'Read the FAST ’17 study', href: 'https://www.usenix.org/conference/fast17/technical-sessions/presentation/vangoor' },
    },
  },

  statusSection: {
    eyebrow: '/status',
    heading: 'Building in the open.',
    lede: "The architecture is accepted and public, and the protocol codec is written. Rx and the cache are at an early stage, and the first client, read-only on Linux, is being built now. There's no working client or release yet, and no promised dates. The GitHub milestones show the current work.",
    nowLabel: 'In progress',
    nextLabel: 'Planned',
    follow: {
      label: 'follow or help',
      title: 'Read, watch, ask',
      links: [
        { label: 'Review ADR 0004', href: adr0004 },
        { label: 'watch the repository', href: repo },
        { label: 'open an issue', href: `${repo}/issues` },
      ],
    },
    buttons: [
      { label: 'View source', href: repo },
      { label: 'Read the design', href: links.docs },
      { label: 'Follow development', href: links.milestones },
    ],
  },
} satisfies Story;
