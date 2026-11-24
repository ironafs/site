# Public incidents: cost of kernel-mode code (research, 2026-11-20)

The incidents the site cites, with their sources. VERIFIED means the page
was opened and the quote is from its text.

## 1. CrowdStrike outage, Windows (19 July 2024)

- Cited in: the `#numbers` section (`≈8.5M`).
- What: a faulty content update read by a kernel-mode driver crashed Windows
  machines worldwide.
- Source: Microsoft, 2024-07-20,
  https://blogs.microsoft.com/blog/2024/07/20/helping-our-customers-through-the-crowdstrike-outage/
- Quote: "We currently estimate that CrowdStrike's update affected 8.5 million
  Windows devices"
- VERIFIED. It counts devices affected by one incident; it is not a rate of
  driver failures. The details are in `recent-stats.md` (4c).

## 2. Apple silicon: third-party kexts need Reduced Security (2020 onwards)

- Cited in: the `#design` macOS panel and the platforms timeline (2020-11).
- What: a Mac with Apple silicon loads no third-party kernel extension at
  Full Security; the owner has to start up in Recovery and lower it.
- Source: Apple Platform Security, "Securely extending the kernel",
  https://support.apple.com/guide/security/securely-extending-the-kernel-sec8e454101b/web
- Quote: "it requires that the secure boot be configured to Reduced
  Security."
- VERIFIED. The date and the steps are in `os-timeline.md` and
  `why-research-2.md`.
