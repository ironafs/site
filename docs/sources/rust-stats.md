# Rust and memory-safety statistics for the "why Rust" section (2019-2026)

Compiled 2026-11-20. Newest first within each group. Does not repeat the items already in recent-stats.md (Android 2025 below 20% and 0.2/MLOC, Android 76% to 35% 2022, MSRC 70% 2019, Windows 70% stop errors) except where a NEW figure sits beside them.

Status key:
- VERIFIED (curl) = I downloaded the page/PDF with curl, extracted the text, and the quote is exact.
- VERIFIED (fetch) = the WebFetch tool returned the quote; it summarises, so treat the wording as as-returned, not byte-checked.
- SNIPPET ONLY = search-result text only. Do not put on the site without opening it.

Rule I followed: no number is rounded or invented. Where a source gave no figure I say so.

---

## A. Memory safety share of vulnerabilities

### A1. Android: 76% (2019) to 24% (2024) of vulnerabilities (Google, 2024-09-25) VERIFIED (curl)
- Counts: share of Android's total vulnerabilities that are memory-safety issues. The 2025 value (<20%) is already in recent-stats 3a; this is the 2024 data point and gives a trend 2019 76 / 2022 35 / 2024 24 / 2025 below 20.
- Source: "Eliminating Memory Safety Vulnerabilities at the Source", Jeff Vander Stoep and Alex Rebert, Google Security Blog. https://security.googleblog.com/2024/09/eliminating-memory-safety-vulnerabilities-Android.html
- Quote: "Memory safety issues, which accounted for 76% of Android vulnerabilities in 2019, and are currently 24% in 2024, well below the 70% industry norm, and continuing to drop."
- Caveat: correlation with language shift is Google's claim; whole Android platform.

### A2. Vulnerabilities decay exponentially with code age (Google, 2024-09-25) VERIFIED (curl)
- Number: "5-year-old code has a 3.4x (using lifetimes from the study) to 7.4x (using lifetimes observed in Android and Chromium) lower vulnerability density than new code." The 3.4x comes from a 2022 USENIX Security study (Alexopoulos et al.); 7.4x is Google's own Android/Chromium data.
- Same page: "vulnerabilities decay exponentially. They have a half-life." and "Code matures and gets safer with time, exponentially, making the returns on investments like rewrites diminish over time as code gets older."
- Same source URL as A1.
- Why it matters for IronAFS: argues for writing NEW code (a new client) in a memory-safe language rather than rewriting old code; the problem "is overwhelmingly with new code".
- Caveat: the simulation in the post uses assumed numbers (average vulnerability lifetime 2.5 years etc., stated in its footnote). The 3.4x/7.4x are measured; the curve is a model.

### A3. Android annual count of memory-safety vulnerabilities fell 223 to 85 (2019 to 2022) (Google, 2022-12-01) VERIFIED (curl)
- Counts: absolute annual number (not a share), from the vulnerability rewards program and internal reports.
- Source: "Memory Safe Languages in Android 13". https://security.googleblog.com/2022/12/memory-safe-languages-in-android-13.html
- Quote: "From 2019 to 2022 the annual number of memory safety vulnerabilities dropped from 223 down to 85."
- Also: "2022 is the first year where memory safety vulnerabilities do not represent a majority of Android's vulnerabilities." (The 76%->35% figure is in recent-stats 3b.)
- Caveat: Google found per-year numbers only as this 2019/2022 pair on this page; I did not find a 2020/2021 value in text (they are in a chart image). Do not state year-by-year values.

### A4. Chromium: around 70% of high-severity bugs are memory unsafety (912 bugs since 2015) VERIFIED (curl)
- Counts: 912 high or critical severity security bugs since 2015, Stable channel. Page is undated; the sample runs from 2015.
- Source: "Memory safety", The Chromium Projects. https://www.chromium.org/Home/chromium-security/memory-safety/
- Quote: "Around 70% of our high severity security bugs are memory unsafety problems (that is, mistakes with C/ C++ pointers). Half of those are use-after-free bugs. (Analysis based on 912 high or critical severity security bugs since 2015, affecting the Stable channel.)"
- Caveat: page undated, the 912 count is a fixed snapshot; the Google blog (A1) calls 70% "the industry norm".

### A5. White House ONCD, Feb 2024: "up to 70 percent" and "nearly eliminated" VERIFIED (curl)
- Source: "Back to the Building Blocks: A Path Toward Secure and Measurable Software", Office of the National Cyber Director, February 2024. https://bidenwhitehouse.archives.gov/wp-content/uploads/2024/02/Final-ONCD-Technical-Report.pdf
- Quote: "up to 70 percent of security vulnerabilities in memory unsafe languages patched and assigned a CVE designation are due to memory safety issues." and "When large code bases are migrated to a memory safe language, evidence shows that memory safety vulnerabilities are nearly eliminated."
- Caveat: a policy report citing industry analysis (footnote viii, ix); the "nearly eliminated" claim is not a measurement in the report itself. Archived (Biden-era) URL; the report is still hosted by the National Archives.

### A6. Mozilla Stylo: 51 of 69 style-component bugs (73.9%) impossible in Rust (2019-02) VERIFIED (fetch)
- Counts: security bugs filed against Firefox's style component, 69 total; 34 critical/high, 32 of those memory-related.
- Source: "Fearless Security: Rewriting a browser component in Rust" (title as indexed; URL slug), Mozilla Hacks. https://hacks.mozilla.org/2019/02/rewriting-a-browser-component-in-rust/
- Quote: "Of the 34 critical/high bugs, 32 were memory-related." and "51 (73.9%) of these bugs would not have been possible."
- Caveat: a retrospective count of what Rust would have prevented, not a post-rewrite outcome measurement. curl returned only a 760-character stub, so quotes are via the fetch tool.

### A7. Project Zero in-the-wild 0-days: no usable per-class number found
- 2020 review (VERIFIED curl): "Memory corruption is still the name of the game and how the vast majority of detected 0-days are getting in." https://projectzero.google/2021/02/deja-vu-lnerability.html (2020 data, 24 detected 0-days per a secondary description; that count not verified in text).
- The "63% of 2019 0-days" and "68%" figures are SNIPPET ONLY (secondary quotes, search summary); DROPPED.
- Google's 2023 in-the-wild review (VERIFIED fetch) gives "In 2023, Google observed 97 zero-day vulnerabilities exploited in-the-wild." but no bug-class percentage; DROPPED as a memory-safety stat. https://blog.google/technology/safety-security/a-review-of-zero-day-in-the-wild-exploits-in-2023/
- Not found: Apple's own memory-safety share, Microsoft's updated post-2019 share, and a year-by-year Android table in text.

---

## B. Rust outcomes in production

### B1. Chrome: FreeType replaced by Rust (Skrifa); FreeType removed from Blink in Chrome 145 (note dated 2026-04-24) VERIFIED (curl)
- Timeline on the page: Chrome 128 (Aug 2024) trial on rare font formats; Chrome 133 (Feb 2025) all web fonts on Linux/Android/ChromeOS; Chrome 136 system fonts on Linux and Android; Chrome 145 removes FreeType from Blink.
- Source: "Memory safety for web fonts", Dominik Röttsches, Rod Sheeter, Chad Brokaw, Chrome for Developers, published 2025-03-19, note added 2026-04-24. https://developer.chrome.com/blog/memory-safety-fonts
- Quotes: "In Chrome 145 we removed FreeType from Blink." and "Despite our best efforts, font security issues have repeatedly reached end users. Replacing FreeType with a Rust alternative will prevent multiple entire classes of vulnerability." and "the high-severity tt_face_get_paint COLRv1 vulnerability took more than 10 months to find."
- Counts: a rollout, not a bug rate. No vulnerability-reduction number is given.

### B2. Linux kernel: Rust experiment declared over (2025-12) VERIFIED (curl)
- Sources: LWN brief, "The (successful) end of the kernel Rust experiment", 2025-12-10, https://lwn.net/Articles/1049831/ ; devclass 2025-12-15 https://devclass.com/2025/12/15/rust-boosted-by-permanent-adoption-for-linux-kernel-code/ . Fuller LWN account (Maintainers Summit) is already in recent-stats 3d.
- Quotes: "The consensus among the assembled developers is that Rust in the kernel is no longer experimental — it is now a core part of the kernel and is here to stay." (LWN) and, quoting Miguel Ojeda, "the experiment is done, i.e. Rust is here to stay." (devclass). Ojeda also said "this does not mean that everything works for every kernel configuration, architecture, toolchain etc".
- Same devclass page: "Android 16 devices based on the 6.12 Linux kernel ship with ashmem (anonymous shared memory subsystem) memory allocator, built with Rust." (as the page's paraphrase of Ojeda.)
- Other claims in search summaries (DRM about a year from requiring Rust for new drivers; Debian APT hard Rust requirement from May 2026) SNIPPET ONLY.

### B3. First Rust kernel CVE: CVE-2025-68260, Rust Binder (2025-12-16) VERIFIED (curl) - HONEST COUNTERPOINT
- Number: first CVE for Rust code in the Linux kernel; published 2025-12-16 (CVE record datePublished 2025-12-16T14:45:02Z); same day: 159 CVEs for C code.
- Source (primary): CVE record. https://cveawg.mitre.org/api/cve/CVE-2025-68260 ; announcement quoted by It's FOSS 2025-12-18. https://itsfoss.com/news/first-linux-kernel-rust-cve/
- Quotes: Kroah-Hartman: "we just assigned our first CVE for some Rust code in the kernel ... where the offending issue just causes a crash, not the ability to take advantage of the memory corruption, a much better thing overall. Note the other 159 kernel CVEs issued today for fixes in the C portion of the codebase". CVE text: "Rust Binder contains the following unsafe operation" and "this leads to memory corruption of the prev/next pointers. This leads to crashes like this one". Race on a death list in drivers/android/binder/node.rs; fixed in 6.18.1 (CVE affected-range data, SNIPPET-level for the exact versions).
- Contradiction to flag: Greg says it "just causes a crash", but the CVE text itself says "memory corruption" and its scoring note says "an attacker can repeatedly trigger the corruption to crash or destabilize the system". Severity differs by tracker (medium vs high, SNIPPET ONLY). Say "an unsafe-block data race; kernel maintainers described the impact as a crash". The bug was in an `unsafe` block, which is the premise of Rust's model.

### B4. Asahi Linux Apple GPU driver in Rust (2023-03) VERIFIED (curl)
- Source: "Paving the Road to Vulkan on Asahi Linux", Asahi Lina, Asahi Linux blog, March 2023. https://asahilinux.org/2023/03/road-to-vulkan/
- Quote: "I even found two memory safety bugs in the DRM scheduler component that were causing kernel oopses for Alyssa and other developers" and "I still haven't gotten any reports of kernel oopses due to bugs in the Rust code at all"
- Counts: a developer's anecdote, not a statistic. The memory-safety bugs were in the shared C scheduler, which is itself evidence for Rust-over-C (a Rust abstraction exposed them).
- LWN 2024-09 (https://lwn.net/Articles/988438, VERIFIED curl): "This driver has shipped with Asahi Linux for some time and, by many accounts, is stable, usable, and a shining example of how Rust can be used in a complex kernel subsystem. That driver remains outside of the mainline kernel, though". Honest counterpoint: not upstream.

### B5. Microsoft: Rust in the Windows kernel and drivers
- 2023-04 (VERIFIED curl, The Register, https://www.theregister.com/2023/04/27/microsoft_windows_rust/): David Weston at BlueHat IL 2023: "There's actually a SysCall in the Windows kernel now that is implemented in Rust" and, counterpoint, "Rewriting Windows in Rust probably isn't going to happen anytime soon". The Rust port was behind a feature flag then.
- 2025-07-24 (VERIFIED curl, Microsoft Surface IT Pro Blog "Safer Drivers, Stronger Devices", https://techcommunity.microsoft.com/blog/surfaceitpro/safer-drivers-stronger-devices/4431411): "the Surface team has contributed further to the open-source windows-drivers-rs for driver development and shipped Surface drivers written in Rust." No number.
- win32kbase_rs.sys (GDI Regions in Rust, Insider build 25905, bounds-check DoS found 2025, fixed June 2025, rated moderate): SNIPPET ONLY (search summaries of ITPro / secondary security sites). I did not open a Microsoft primary page for it. DWriteCore line counts: NOT FOUND, dropped.
- 2025-12 Galen Hunt "eliminate every line of C and C++ from Microsoft by 2030": SNIPPET ONLY, and Microsoft said it is a research goal, not a plan to rewrite Windows (TechRadar, InfoWorld). Do not cite as a Microsoft plan.

### B6. Cloudflare Pingora (2022-09-14) VERIFIED (curl)
- Number: serves "over 1 trillion requests a day"; "Pingora consumes about 70% less CPU and 67% less memory compared to our old service with the same traffic load."
- Source: "How we built Pingora, the proxy that connects Cloudflare to the Internet", Cloudflare Blog. https://blog.cloudflare.com/how-we-built-pingora-the-proxy-that-connects-cloudflare-to-the-internet/
- Quote also: "NGINX is purely in C, which is not memory safe by design. It is very error-prone to work with such a 3rd party code base." and "We chose Rust as the language of the project because it can do what C can do in a memory safe way without compromising performance."
- Caveat: the saving is partly architecture (the post says so; it also credits replacing Lua), not Rust alone.

### B7. AWS: Mountpoint for Amazon S3 (a Rust FUSE file client) and Firecracker
- Mountpoint (2026-11-20 pull, GitHub API, VERIFIED curl; no credential): repo awslabs/mountpoint-s3 description "A simple, high-throughput file client for mounting an Amazon S3 bucket as a local file system." Language bytes: Rust 3,834,919, Python 92,517, Shell 53,072, C 1,737. README: it builds on "The fuser bindings for FUSE". https://github.com/awslabs/mountpoint-s3
- This is the closest public analogue to IronAFS: a network storage client in Rust over FUSE, from a hyperscaler. I could not retrieve an AWS blog sentence that states WHY it is Rust (the AWS blog pages are JS-heavy; fetch returned navigation only). Do not claim a stated reason.
- Firecracker (VERIFIED curl): GitHub language bytes Rust 5,192,127, Python 1,292,338, C 43,039. FAQ: "Firecracker started from Chromium OS's Virtual Machine Monitor, crosvm, an open source VMM written in Rust." https://firecracker-microvm.github.io/
- Not obtained: Bottlerocket, s2n, Meta, Dropbox figures (not searched to a source).

### B8. Android Rust code-review and rollback numbers
- Already in recent-stats 3a (4x lower rollback rate, 25% less review time). Additional from search summary of the same Google post: "about 20% fewer revisions" for similar-sized changes: SNIPPET ONLY, not opened here. Open https://blog.google/security/rust-in-android-move-fast-fix-things/ before using.

---

## C. Government and industry guidance

### C1. CISA/NSA joint guide, "Memory Safe Languages: Reducing Vulnerabilities in Modern Software Development" (2025-06-24) VERIFIED (curl)
- Source: CISA. https://www.cisa.gov/resources-tools/resources/memory-safe-languages-reducing-vulnerabilities-modern-software-development
- Page says: "CISA and the National Security Agency (NSA) published joint guide, Memory Safe Languages: Reducing Vulnerabilities in Modern Software Development" with a "Publish Date June 24, 2025". No numeric claim on the page. I did not open the PDF.

### C2. CISA "Product Security Bad Practices", v2.0 (revision date January 17, 2025) VERIFIED (curl)
- Source: https://www.cisa.gov/resources-tools/resources/product-security-bad-practices
- Quote: "The development of new product lines for use in service of critical infrastructure or NCFs in a memory-unsafe language (e.g., C or C++) where readily available alternative memory-safe languages could be used is dangerous and significantly elevates risk to national security, national economic security, and national public health and safety. For existing products written in memory-unsafe languages, not having a published memory safety roadmap is dangerous".
- The 2026-01-01 roadmap deadline: NOT FOUND in the page text I extracted (the quote says a published roadmap is expected but gives no date). Do not cite a Jan 1 2026 deadline from this source. (Search for "memory safety roadmap by January 1, 2026" not completed.)
- Caveat: voluntary guidance for critical-infrastructure manufacturers.

### C3. CISA "The Case for Memory Safe Roadmaps" (2023-12-06) VERIFIED (curl, title and date only)
- https://www.cisa.gov/resources-tools/resources/case-memory-safe-roadmaps . Page confirms "Publish Date December 06, 2023". No number extracted.

### C4. ONCD Feb 2024: see A5.
### C5. NSA Nov 2022 "Software Memory Safety" guidance: NOT VERIFIED. Both the PDF and the NSA press release returned 403 to me. The ONCD report (A5) already supplies the "up to 70 percent" claim from a primary government source. EU (Cyber Resilience Act) and UK NCSC memory-safety pages: not retrieved (the NCSC URL I tried 404'd); no figure. Dropped.

---

## D. Performance and concurrency

### D1. Discord Read States, Go to Rust (2020-02-04) VERIFIED (curl)
- Number: Go service had "large latency spikes" "every few minutes" ("latency and CPU spikes roughly every 2 minutes", forced GC); the Rust version "had no latency spikes" and was "just as good as Go's" on first port, then faster after tuning; after raising cache capacity "average time is now measured in microseconds and max @mention is measured in milliseconds".
- Source: "Why Discord is switching from Go to Rust", Jesse Howarth, Discord Engineering. https://discord.com/blog/why-discord-is-switching-from-go-to-rust
- Quotes: "The latency of the Rust version was just as good as Go's and had no latency spikes!" and "Even with just basic optimization, Rust was able to outperform the hyper hand-tuned Go version."
- Caveat: Go 1.9.2 (footnote: "Go version 1.9.2"), an old Go runtime. A single service. Use as "no GC pauses", not as "Rust is N times faster than Go".

### D2. Data-race freedom evidence
- No quantitative study found beyond the Binder CVE (B3), which is itself a data race in unsafe code. Rust's own documentation states the guarantee; I did not source a measured number. Dropped.

---

## E. Rust for file systems and storage clients

- Mountpoint for Amazon S3 (Rust FUSE client, AWS): see B7. Strongest direct analogue.
- Proxmox pmxcfs (cluster file system) Rust rewrite, patch series v3, March 2026: SNIPPET ONLY (search summary of a lore.proxmox.com thread); under review, not shipped. https://lore.proxmox.com/all/20260323113239.942866-1-k.chai@proxmox.com
- cvmfs Rust client reimplementations (self-reported benchmarks): SNIPPET ONLY; DROPPED (independent hobby projects, self-reported).
- fuser crate (the Rust FUSE library Mountpoint uses): SNIPPET/README only; latest listed 0.18.0.
- Not found: Microsoft or Samba/SMB storage components rewritten in Rust; Rust FUSE production case studies with numbers.
- Related, already covered kernel-side: Janus/Hydra FS bug counts in recent-stats section 2.

---

## F. Honest counterpoints

### F1. About 19.11% of crates use `unsafe` (Rust Foundation, 2024-05-21) VERIFIED (fetch)
- Quote: "Of those 127,000 crates, 24,362 make use of the unsafe keyword, which is 19.11% of all crates." ("As of May 2024, there are about 145,000 crates; of which, approximately 127,000 contain significant code.")
- Source: Rust Foundation, "Unsafe Rust in the Wild: Notes on the Current State of Unsafe Rust". https://rustfoundation.org/media/unsafe-rust-in-the-wild-notes-on-the-current-state-of-unsafe-rust/
- The search summary adds that most uses are calls into C/C++ (not re-verified here). Honest framing: a client that calls FUSE/FSKit/SMB-adjacent C APIs will need some unsafe at the boundary.

### F2. All memory-safety bugs in Rust CVEs need unsafe code (Xu et al., 2021) VERIFIED (curl)
- Source: "Memory-Safety Challenge Considered Solved? An In-Depth Study with All Rust CVEs", Xu, Chen, Sun, Zhou, Lyu, arXiv:2003.03296v6, Feb 2021 (ACM TOSEM). https://arxiv.org/abs/2003.03296
- Quote: "surveying 186 real-world bug reports ... which contain all existing Rust CVEs (common vulnerability and exposures) of memory-safety issues by 2020-12-31" and "Rust can keep its promise that all memory-safety bugs require unsafe code, and many memory-safety bugs in our dataset are mild soundness issues that only leave a possibility to write memory-safety bugs without unsafe code."
- Caveat: dataset ends 2020-12-31; older than the 2021-2026 body.

### F3. Cloudflare outage, 2025-11-18: a Rust `unwrap()` panic took down the core proxy VERIFIED (curl)
- Number: started 2025-11-18 11:20 UTC, all services resolved 17:06 UTC (per the page's timeline; the duration is my arithmetic, about 5 h 46 min). A feature file with more than 200 entries (the limit is 200, normal use about 60) hit a preallocated-memory limit.
- Source: Cloudflare postmortem of 18 November 2025. https://blog.cloudflare.com/18-november-2025-outage/
- Quotes: "Currently that limit is set to 200, well above our current use of ~60 features." and "thread fl2_worker_thread panicked: called Result::unwrap() on an Err value".
- Use: Rust removes memory-unsafety, not logic or error-handling mistakes. Fair counterpoint for an honest page.

### F4. Kernel Rust is not universal yet
- Ojeda quote in B2 ("this does not mean that everything works for every kernel configuration, architecture, toolchain etc"); Asahi GPU driver still out-of-tree (B4); Microsoft says rewriting Windows in Rust "probably isn't going to happen anytime soon" (B5, 2023, dated).
- Adoption cost numbers (build time, training): NOT FOUND.

---

## Contradictions and cautions
1. CVE-2025-68260: "crash only" (Greg KH) vs CVE text "memory corruption"; severity differs by tracker. Say both.
2. Android: 24% (2024) vs "below 20%" (2025) vs 35% (2022): different years, same metric; consistent trend, but do not call any of them "Rust's effect" alone (Google says correlation).
3. Chromium "70%" (page undated, since 2015), Microsoft "70%" (2019), ONCD "up to 70 percent": three sources citing similar numbers over different populations; do not add them as independent confirmations of one number, and the ONCD figure itself cites industry analysis.
4. Pingora's CPU and memory savings mix Rust with a re-architecture.
5. Discord's comparison used Go 1.9.2.
6. Not found / dropped: Project Zero 63% and 68% (secondary), NSA 2022 (403), a verified Jan 1 2026 CISA deadline, DWriteCore numbers, Meta/Dropbox/Bottlerocket/s2n, Apple's figure, EU/UK guidance, measured data-race evidence.
