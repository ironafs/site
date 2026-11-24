# Recent statistics for the "why user space" section (2018-2026)

Compiled 2026-11-20. VERIFIED = I opened the page or PDF and the quote is from it. SNIPPET ONLY = search-result text only. Numbers are copied, not rounded.

## Headline caveat

No recent peer-reviewed paper gives a clean "X% of Linux kernel bugs are in drivers" figure for 2018-2026. The sourced numbers below measure different things (CVEs by touched directory, regression bugs, crash root causes, exploits). Do not merge them into one claim. Do not claim "drivers cause N% of crashes" using Chou 2001 or Swift 2003 type wording unless the source says crashes.

---

## 1. Drivers / out-of-core code

### 1a. Linux kernel CVEs by directory, 2025-2026 (secondary tracker, VERIFIED page)
- Year: data pulled 2026-10-23.
- Number: about 50% of 2025 kernel CVE records touch `drivers/` (table: drivers/ 50% in 2025, 49% in 2026; fs/ 16% and 13%; net/ 15% and 20%).
- Counts: CVE records (NVD + vulns.git), each assigned to the top-level directory of the files its fix touched. A record can touch several directories, so shares do not sum to 100.
- Population: kernel CNA CVEs published 2025 and Jan-Oct 2026. NVD non-rejected counts by publication date: 4,287 (2024), 5,675 (2025), 7,856 (2026 to 22 Oct).
- Source: "Linux Kernel CNA: How Kernel CVEs Are Assigned and What To Do With Them", safeguard.sh. https://safeguard.sh/resources/blog/linux-kernel-cna-how-kernel-cves-are-assigned-and-what-to-do-with-them
- Quote: "about half of the 2025 and 2026 records touch `drivers/`"
- Caveats: a vendor blog, not the kernel CNA; I could not reproduce it from vulns.git. The kernel has been a CNA since Feb 2024 and assigns a CVE to nearly every stable fix (LWN, 2024-06-19: "863 allocations out of the 16,514 commits between v6.7.1 and v6.8.9", "a mere 5% hit rate"; https://lwn.net/Articles/978711, VERIFIED). So the count measures where fixes landed, not severity or exploitability; the post says fewer than 3 percent are rated Important or above (from search summary, SNIPPET ONLY for that clause). A directory share also partly reflects that drivers/ is the largest directory by code size; it is not a per-line rate. commandlinux.com publishes a 2020-2024 table (Device Drivers 12.1%, Filesystem Drivers 13.5%, Networking 20.1%) that contradicts this; it cites MITRE/LKML with no method, so DROPPED as unverified.

### 1b. Windows stop errors by root cause (Microsoft Learn, VERIFIED, undated data)
- Year: page last updated 2026-02-12 (ms.date). The underlying analysis is undated on the page; a Microsoft engineering blog (Crash Dump Analysis, SNIPPET ONLY) traces the same split to crash reports up to April 2004.
- Number: 70% of stop errors (BSODs) caused by third-party driver code; 10% hardware; 5% Microsoft code; 15% unknown (dump too corrupted). The same page says "about 75 percent of all stop errors are caused by faulty drivers" (Driver Verifier section).
- Counts: crashes (bug checks), root-cause analysis, population and sample not stated.
- Source: "Stop code error or bug check troubleshooting", Microsoft Learn. https://learn.microsoft.com/en-us/troubleshoot/windows-client/performance/stop-error-or-blue-screen-error-troubleshooting
- Quote: "Our analysis of the root causes of crashes indicates that: 70% are caused by third-party driver code."
- Caveat: current official Microsoft page, but old, undated data. If used, attribute as "Microsoft's published crash analysis" and not as a 2026 measurement. I found no newer public Microsoft crash-cause breakdown.

### 1c. Linux regression bugs by subsystem (arXiv preprint, VERIFIED)
- Year: 2024 (arXiv 2411.02091, 4 Nov 2024; ACM-format preprint, venue not stated).
- Number: device drivers account for "about 55% of all regression bugs in the sample".
- Counts: regression bugs tracked by regzbot, n = 936, reports 2021-2024. Regressions, not crashes or CVEs.
- Source: Ruohonen and Alami, "Fast Fixes and Faulty Drivers: An Empirical Analysis of Regression Bug Fixing Times in the Linux Kernel". https://arxiv.org/abs/2411.02091
- Quote: "device drivers have clearly been the most prone subsystem to regression bugs. In fact, these account for about 55% of all regression bugs in the sample."
- Caveat: not peer-reviewed as far as I could see; only four years covered (regzbot's limit); regzbot is a voluntary tracker. Good for "drivers are the most regression-prone subsystem", weaker as a headline.

### 1d. Android: vendor kernel driver exposure (USENIX Security 2025, VERIFIED)
- Year: 2025 (34th USENIX Security, Aug 13-15, 2025).
- Number: 59.1% of the 131 analyzed Android devices were exploitable by highly critical n-day kernel driver flaws; 61.4% had at least one known driver vulnerability (any severity). 11 drivers are reachable from untrusted apps (more than just GPU). 50 known vulnerabilities found in them; analysis used 493 firmware images.
- Counts: devices (not crashes, not CVE share); unpatched known (n-day) vulnerabilities in drivers reachable from untrusted apps.
- Source: Maar et al. (Graz University of Technology), "The Doom of Device Drivers: Your Android Device (Most Likely) has N-Day Kernel Vulnerabilities". https://www.usenix.org/system/files/usenixsecurity25-maar-doom.pdf
- Quote: "At the time of our analysis, 59.1 % of recent Android devices in our representative set can be exploited by highly critical n-day flaws, with 61.4 % affected by vulnerabilities of any severity."
- Caveat: "representative set" of 131 devices, not the whole ecosystem. It is about vendor patch lag, which fits the out-of-tree argument (vendor-carried drivers fall behind).

### 1e. Android GPU drivers dominate kernel exploits (Google, VERIFIED + secondary)
- Year: 2025-12-09 (Google, VERIFIED); 2023 annual review figure cited via the USENIX 2025 paper (secondary, VERIFIED in the paper's text).
- Number: "since 2021, the majority of Android kernel driver-based exploits have targeted the GPU"; Mali driver "used on approximately 45% of Android devices". Via USENIX paper: Google's 2023 annual review attributed "4 of 5 device compromises to GPU driver vulnerabilities, with only 1 involving the core Linux kernel".
- Counts: exploits / device compromises (small n = 5; do not turn into a percentage of all bugs).
- Source: "Further Hardening Android GPUs", Google. https://blog.google/security/further-hardening-android-gpus/
- Quote: "since 2021, the majority of Android kernel driver-based exploits have targeted the GPU."

### Not found
- A recent (2018-2026) peer-reviewed Linux study giving "drivers are N% of all kernel bugs". The only matches were restatements of Chou 2001 (the OS-defects preprint arXiv 2608.20643, Aug 2026, repeats "driver error rates are three to seven times higher"; its own layer breakdown I did not extract, so no figure).
- syzbot per-subsystem counts: only totals found (a 2024 arXiv paper cited "over 5,570 bugs ... 4,604 patched", SNIPPET ONLY). The dashboard itself was not opened.

---

## 2. Kernel file-system bugs

### 2a. Janus (IEEE S&P 2019, VERIFIED)
- Year: 2019 (Symposium on Security and Privacy, May 2019).
- Number: 90 bugs in the upstream Linux kernel, 62 acknowledged, 43 patched, 32 CVEs assigned.
- Counts: new bugs found by fuzzing eight file systems (including ext4, XFS, Btrfs), not a share of anything.
- Source: Xu et al., "Fuzzing File Systems via Two-Dimensional Input Space Exploration". https://sanidhya.github.io/pubs/2019/janus.pdf (press: https://www.cc.gatech.edu/news/622029/janus-finds-more-bugs-file-systems-any-fuzzer)
- Quote: "We evaluate JANUS on eight file systems and found 90 bugs in the upstream Linux kernel, 62 of which have been acknowledged." and "...fixed with 32 CVEs assigned."

### 2b. Hydra (SOSP 2019)
- Year: 2019, SOSP '19, Huntsville.
- Number in the PDF I opened (an earlier draft, VERIFIED): "Hydra has discovered 91 new bugs in Linux file systems". Search snippets for the final proceedings version say 157 (123 memory errors, 8 crash-consistency, 4 POSIX, 23 logic), and the Georgia Tech release says 155 (SNIPPET ONLY). I could not reconcile these. Use 91 only with that draft's wording, or check the ACM version before citing a higher figure.
- Same PDF, background figure: "ext4 and Btrfs, with 50K and 130K lines of code, respectively, witnessed 54 and 113 bugs reported in 2018 alone." (VERIFIED in that draft; bugs reported in one year.)
- Source: Kim et al., "Finding Semantic Bugs in File Systems with an Extensible Fuzzing Framework". https://gts3.org/assets/papers/2019/kim:hydra.pdf
- Caveat for 2a and 2b: they count bugs found by a research tool in a period; they are not a rate. Both are 2019, at the very start of the requested window. No 2020-2026 FS-bug study with a countable headline was found (a 2026 arXiv survey, 2602.02614, "Testing Storage-System Correctness", gives no counts).

---

## 3. Memory safety and Rust

### 3a. Android 2025: memory-safety share below 20% (Google, VERIFIED)
- Year: 2025-11-13.
- Number: memory-safety vulnerabilities fell "below 20% of total vulnerabilities for the first time" (2025 data, collected a couple of months before year end). Rust vulnerability density estimated at 0.2 per million lines (MLOC) against close to 1,000 per MLOC for Android C/C++; the post says "more than 1000x reduction". Rust changes have a "4x lower rollback rate" and spend "25% less time in code review".
- Counts: share of Android's total vulnerabilities (all components, not kernel only). The 0.2 figure rests on one potential vulnerability found and fixed pre-release.
- Source: "Rust in Android: move fast and fix things", Jeff Vander Stoep, Google. https://blog.google/security/rust-in-android-move-fast-fix-things/
- Quote: "our estimated vulnerability density for Rust is 0.2 vuln per 1 million lines (MLOC). Our historical data for C and C++ shows a density of closer to 1,000 memory safety vulnerabilities per MLOC"; also "Android's 6.12 Linux kernel is our first kernel with Rust support enabled and our first production Rust driver."
- Caveat: Google's own data; whole platform, not the kernel; the density comparison is over code of different age and role.

### 3b. Android 2019 to 2022: 76% to 35% (Google, VERIFIED)
- Year: 2022-12-01.
- Number: "From 2019 to 2022 it has dropped from 76% down to 35% of Android's total vulnerabilities."
- Source: "Memory Safe Languages in Android 13". https://security.googleblog.com/2022/12/memory-safe-languages-in-android-13.html
- Caveat: same as 3a; Google ties the drop to writing new code in memory-safe languages.

### 3c. Microsoft: about 70% of CVEs are memory safety (2019, VERIFIED)
- Year: 2019-07 (MSRC blog, series by Microsoft). Period in the underlying data: not stated on this page.
- Number: roughly 70% of the CVEs the MSRC assigns are memory-safety issues.
- Source: "Why Rust for safe systems programming", MSRC. https://www.microsoft.com/en-us/msrc/blog/2019/07/why-rust-for-safe-systems-programming
- Quote: "roughly 70% of the security issues that the MSRC assigns a CVE to are memory safety issues."
- Caveat: Microsoft code across products, not kernel only; the post infers "would most likely have been eliminated". Older than 2018-2026 is not an issue (2019), but it is not new.

### 3d. Linux Rust-for-Linux (LWN, VERIFIED; qualitative)
- Year: 2025-12-13 (2025 Maintainers Summit report).
- Facts: "the Android binder driver was merged for 6.18"; Rust code "having grown by a factor of five over the last year"; "there are millions of real devices running kernels with Rust code now"; "Drivers in Rust, he said, are indeed proving to be far safer than those written in C"; on Rust code, "no such CVE has yet been issued" (Kroah-Hartman, as of that report).
- Source: LWN, Jonathan Corbet. https://lwn.net/Articles/1050174/
- Caveat: a later search result (SNIPPET ONLY) reports the first Rust kernel CVE, CVE-2025-68260, in the Binder driver (unsafe-code race, crash only, Dec 2025). So the "no CVE yet" quote is superseded. No measured Linux memory-safety CVE share was found; Kroah-Hartman's percentage estimates (SNIPPET ONLY) are projections, DROPPED.

---

## 4. Out-of-tree breakage and compatibility holds

### 4a. Kernel-to-driver breakage corpus (arXiv, VERIFIED, indirect)
- Year: 2025-11-24 (arXiv 2511.18924, MBZUAI).
- Number: corpus v5.10-v6.10 with "235 validated cases drawn from 612 candidates" of kernel changes that break drivers; "driver code accounts for roughly half of all modified lines per release".
- Counts: candidate and validated kernel-to-driver co-evolution cases that the authors mined (a benchmark construction count, not a rate of how often modules break).
- Source: Kharlamova et al., "LLM-Driven Kernel Evolution: Automating Driver Updates in Linux". https://arxiv.org/abs/2511.18924
- Quote: "The corpus spans v5.10-v6.10 with 235 validated cases drawn from 612 candidates." and "driver code accounts for roughly half of all modified lines per release".
- Caveat: preprint; both numbers are about churn in driver code, not about how often out-of-tree modules fail. Kernel's own policy page (https://docs.kernel.org/process/stable-api-nonsense.html, SNIPPET ONLY) states there is no stable in-kernel driver interface.

### 4b. Windows safeguard holds
- No public count of devices blocked or of holds found (Microsoft counts are only in tenant-level Update Compliance reports). Microsoft documents holds as a mechanism: https://learn.microsoft.com/windows/deployment/update/safeguard-holds (SNIPPET ONLY). DROPPED as a statistic.

### 4c. Windows: CrowdStrike (2024)
- Number: "We currently estimate that CrowdStrike's update affected 8.5 million Windows devices" (Microsoft, 2024-07-20, VERIFIED). https://blogs.microsoft.com/blog/2024/07/20/helping-our-customers-through-the-crowdstrike-outage/
- Counts: devices affected by one faulty kernel-mode driver update (an incident, not a rate). Microsoft's follow-up (2024-07-27) says "CrowdStrike loads four driver modules" and gives no device count (VERIFIED); the Windows Resiliency Initiative (Nov 2024) post gives no driver statistics (VERIFIED).
- Caveat: the cause was an unvalidated content file read by a kernel driver; that is a kernel-mode-driver failure but not "a driver bug rate". Do not generalise.

### 4d. DKMS / out-of-tree failure rate
- No study or telemetry found. DROPPED.

---

## Six strongest for the site

See the summary returned with this file. Ranking, strongest first:
1. Android 2025 memory-safety share under 20% and Rust density (3a), Google, 2025-11-13.
2. Android 2019 to 2022, 76% to 35% (3b), Google, 2022-12-01 (pair with 1 as a trend).
3. USENIX Security 2025, 59.1% of 131 devices with highly critical n-day driver vulnerabilities (1d).
4. Linux kernel CVEs: about 50% touch drivers/, 16% fs/ (1a), with the CNA inflation caveat.
5. Windows 70% of stop errors from third-party driver code (1b), with the undated-data caveat.
6. Linux regressions: 55% in drivers, n = 936 (1c); or Janus 90 FS bugs / 32 CVEs (2a) for file systems.
