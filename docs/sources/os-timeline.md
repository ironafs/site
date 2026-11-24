# OS timeline research: moving code out of the kernel (2005-2026)

Read 2026-11-20. Method: pages fetched with curl and text-extracted, quotes copied from the extracted text
(Apple documentation pages are JavaScript-rendered, so their text came from Apple's own documentation JSON
at developer.apple.com/tutorials/data/...). The black-screen layout was read from Microsoft's own image.
Status words: VERIFIED (primary source read, quote exact) / SNIPPET ONLY / CORRECTED.
Starting point: `docs/research/2026-11-20-kernel-code-and-user-space.md` (ironafs origin/main), re-checked here.

## LINUX

| Date | Event | Status | URL |
|---|---|---|---|
| 2005-10-27 | FUSE merged in Linux 2.6.14 | VERIFIED | https://kernelnewbies.org/Linux_2_6_14 |
| 2024-05-12 | FUSE passthrough, Linux 6.9 | VERIFIED | https://kernelnewbies.org/Linux_6.9 |
| 2025-03-24 | FUSE over io_uring, Linux 6.14 | VERIFIED | https://kernelnewbies.org/Linux_6.14 |
| 2025-12-10 | Rust in the kernel no longer experimental | VERIFIED | https://lwn.net/Articles/1049831/ |
| 2026-10 | FUSE io_uring supports zero-copy in Linux 7.3 | VERIFIED | https://kernel.googlesource.com/pub/scm/linux/kernel/git/torvalds/linux/%2B/9cebfe6504488198b012e746bc6b313f88b95439 |

1. **FUSE, 2.6.14, 2005-10-27.** Kernelnewbies page header: "Released October 27, 2005". Entry under Filesystems:
   "FUSE : Allows to implement a fully functional filesystem in a userspace program".
   Note: the page gives the release date of 2.6.14, and FUSE is listed in that release; it does not give a separate merge-window date.
   Say "arrived in Linux 2.6.14 (27 Oct 2005)", not "merged on 27 Oct".
2. **Passthrough, 6.9.** "Linux 6.9 was released on Sunday, 12 of May 2024". Section "Faster FUSE I/O": "This release adds a
   passthrough mode for regular file I/O. This allows performing read and write (also via memory maps) on a backing file
   without incurring the overhead of roundtrips to userspace. For now this is only allowed to privileged servers, but this
   limitation will go away in the future." Kernel docs (https://docs.kernel.org/filesystems/fuse/fuse-passthrough.html):
   "Passthrough allows certain operations on a FUSE file to bypass the userspace daemon"; "Setting up passthrough
   functionality currently requires the FUSE daemon to possess the CAP_SYS_ADMIN capability." Correct as the user had it (6.9, 2024).
3. **io_uring, 6.14.** "Linux 6.14 was released on Monday, 24 Mar 2025." Section: "This release adds FUSE support for io-uring
   communication between kernel and userspace, with the purpose of increasing FUSE performance (reducing context switches, etc)".
   Kernel doc (https://docs.kernel.org/filesystems/fuse/fuse-io-uring.html) says the interface "is still in development and might
   change". Correct as the user had it (6.14, 2025).
4. **Rust.** LWN, "The (successful) end of the kernel Rust experiment", posted December 10, 2025: "Rust in the kernel is no
   longer experimental — it is now a core part of the kernel and is here to stay. So the "experimental" tag will be coming off."
   Patch thread "[PATCH] rust: conclude the Rust experiment" (https://lkml.iu.edu/2512.1/06201.html, 13 Dec 2025, Miguel Ojeda):
   "At the 2025 Linux Kernel Maintainers Summit, the experiment has just been deemed concluded" and "But the experiment is done, i.e.
   Rust is here to stay." Note the "experimental" tag was being removed by patch; the decision date is the Maintainers Summit, 10 Dec 2025.
5. **Zero-copy, 7.3.** The `fuse-update-7.3` merge includes the FUSE io_uring buffer pool and zero-copy interface.
   The kernel's [FUSE io_uring documentation](https://kernel.org/doc/html/next/filesystems/fuse/uapi/fuse-uapi-io-uring.html)
   describes the per-file opt-in.

## macOS

| Date | Event | Status | URL |
|---|---|---|---|
| 2019-06 / 2019-10-07 | System Extensions and DriverKit introduced, macOS Catalina 10.15 (WWDC19; Catalina released 7 Oct 2019) | VERIFIED | https://developer.apple.com/videos/play/wwdc2019/702/ |
| 2020-06 / 2020-11-12 | macOS Big Sur: kexts deprecated in Catalina no longer load by default | VERIFIED | https://developer.apple.com/support/kernel-extensions/ |
| 2020-11 | Apple silicon Macs: third-party kexts need Reduced Security | VERIFIED (date CORRECTED, see below) | https://support.apple.com/guide/security/securely-extending-the-kernel-sec8e454101b/web |
| 2025-03-31 | FSKit available, macOS 15.4 | VERIFIED | https://developer.apple.com/documentation/macos-release-notes/macos-15_4-release-notes |
| 2026-06 (announced) / macOS 27 | FSKit "Handler" protocols, caller identity (FSContext), kernel data cache control | VERIFIED | https://developer.apple.com/documentation/updates/fskit |

1. **System Extensions + DriverKit, Catalina.** WWDC19 session 702 transcript: "MacOS Catalina introduces two new technologies
   called System Extensions and DriverKit." and "A System Extension is part of your app that extends the functionality of the
   operating system in ways similar to a Kernel Extension but running in user space outside the kernel." Apple support page
   (https://developer.apple.com/support/kernel-extensions/): "System extensions on macOS Catalina 10.15 or later allow software, such as
   network extensions and endpoint security solutions, to extend the functionality of macOS without requiring kernel-level access. ...
   kernel extensions have been deprecated." Catalina release date: "Released October 7, 2019" (https://support.apple.com/103107).
   The WWDC19 session date (June 2019) is not printed on the transcript text I read; the event was WWDC19, 3-7 June 2019 (not re-checked on an Apple page).
   Use 2019, macOS 10.15 Catalina. User's date correct.
2. **Deprecation, Big Sur.** Same support page: "Starting with macOS Big Sur, macOS releases no longer load kernel extensions that use
   deprecated kernel programming interfaces (KPIs) by default." WWDC20 session 10210 (https://developer.apple.com/videos/play/wwdc2020/10210/):
   "Catalina was the last released to fully support kexts without any compromises. We've begun deprecating kernel extensions that can
   perform the same function as a system extension including the device families supported by DriverKit. In macOS Big Sur, kexts that were
   deprecated in macOS Catalina will not load by default." Apple's word is deprecated, not removed. Big Sur's first release 11.0.1 is dated
   12 November 2020 (Spanish-language copy of https://support.apple.com/102905 says "Publicado el 12 de noviembre de 2020"; English page
   text I fetched has no date line, so this date is SNIPPET ONLY).
3. **Apple silicon and Reduced Security.** CORRECTED: it is not a separate 2020 "macOS 11" rule that I found dated; it is how third-party kexts work
   on Apple silicon Macs, which Apple announced on 10 November 2020 ("Apple unleashes M1", https://www.apple.com/newsroom/2020/11/apple-unleashes-m1/;
   macOS Big Sur is what they ran). Apple Platform Security: "Kexts need to be explicitly enabled for a Mac with Apple silicon by holding
   the power button at startup to enter into One True Recovery (1TR) mode, then downgrading to Reduced Security and checking the box to
   enable kernel extensions." and "Rebuilding the AuxKC requires the user's approval and restarting of the macOS to load the changes into the
   kernel, and it requires that the secure boot be configured to Reduced Security." Same page: "By running in user space, system extensions
   increase the stability and security of macOS." Apple's page itself carries no date; the date is the Apple silicon launch (Nov 2020).
4. **FSKit, macOS 15.4.** CORRECTED against the "announced 2024 with macOS 15" idea: FSKit was not available to third parties in 15.0-15.3.
   macOS Sequoia 15.4 release notes, FSKit, New Features: "FSKit is now available, enabling delivery of user space file systems as Application
   Extensions. These file systems support integration with DiskArbitration. (44900760)". Apple's FSKit documentation metadata: introducedAt macOS 15.4.
   Overview: "You do this by developing an FSKit module ..., which you deliver as an app extension that runs in user space, and is compatible
   with Mac App Store distribution." macOS 15.4 release date: "Released March 31, 2025" (https://support.apple.com/en-us/122373).
   The claim that FSKit was removed from the final 15.0 SDK is a DTS forum post (thread 765424), SNIPPET ONLY; not needed for the timeline.
5. **macOS 27 FSKit additions.** Apple "FSKit updates" page, entry "June 2026": "Update your ... implementations to adopt ... and the related
   "handler" protocols, which replace the now-deprecated ... and other "operations" protocols. The "Handler" protocols provide richer ...
   subtypes to pass back to the framework after each call completes. Some calls also provide an ... parameter which contains user and group
   identifiers. You can use these to restrict access to your filesystem to known callers. Improve performance with kernel data caching, by
   conforming to the ... protocol." (symbol names are links in the source and drop out of the extracted text).
   FSContext (introducedAt macOS 27.0): "This object contains the user ID and group ID of the process that initiated the file system operation,
   allowing file systems to make authorization decisions based on the caller's identity." Four fields: realUserID, realGroupID, effectiveUserID, effectiveGroupID.
   setCacheState(for:cacheMode:coherencyType:action:) (introducedAt macOS 27.0): "Sends a synchronous cache state update request from the
   module to the kernel." Discussion: "Volumes conforming to [DataCacheHandler] call this method to proactively notify the kernel about cache
   policy changes that need to be applied immediately." Actions: "push, invalidate, update, or revoke".
   Wording note: Apple does not say "cache purge" or "FSKit lacked X"; those are our words. Use "caller identity" and "kernel cache control".
   macOS 27 ("Golden Gate") shipped September 2026; the 14 Sept date is from 9to5Mac/TechRadar (secondary, SNIPPET ONLY). I found no primary Apple date;
   safer to write "macOS 27 (2026)". WWDC26 announcement was 8 June 2026 (9to5mac, secondary).

## WINDOWS

| Date | Event | Status | URL |
|---|---|---|---|
| Windows Vista era (2007) | UMDF (User-Mode Driver Framework) 1.5 ships with Windows Vista | VERIFIED version; date weak | https://learn.microsoft.com/en-us/windows-hardware/drivers/wdf/umdf-version-history |
| 2017-10 | Cloud files API introduced, Windows 10 version 1709 (Fall Creators Update) | VERIFIED version; month from the release | https://learn.microsoft.com/en-us/windows/win32/cfapi/build-a-cloud-file-sync-engine |
| 2018-10 | Projected File System (ProjFS), minimum client Windows 10 version 1809 | VERIFIED version; month from the release | https://learn.microsoft.com/en-us/windows/win32/projfs/projfs-programming-guide |
| 2023-12-13 | Windows protected print mode announced (blocks third-party print drivers) | VERIFIED; shipping date CORRECTED | https://techcommunity.microsoft.com/blog/microsoft-security-blog/a-new-modern-and-secure-print-experience-from-windows/4002645 |
| 2024-11-19 | Windows Resiliency Initiative, Quick Machine Recovery announced; security products outside kernel, private preview promised for July 2025 | VERIFIED | https://blogs.windows.com/windowsexperience/2024/11/19/windows-security-and-resiliency-protecting-your-business/ |
| 2025-06-26 | Windows endpoint security platform private preview "next month" (July 2025) to MVI partners | VERIFIED | https://blogs.windows.com/windowsexperience/2025/06/26/the-windows-resiliency-initiative-building-resilience-for-a-future-ready-enterprise |
| 2025-07-22 | Quick Machine Recovery GA; new unexpected-restart screen GA (24H2, KB5062660) | VERIFIED | https://techcommunity.microsoft.com/blog/windows-itpro-blog/resilience-in-action-for-windows-devices/4434571 |
| 2026-05-14 | Driver Quality Initiative (WinHEC 2026) | VERIFIED | https://blogs.windows.com/windowsexperience/2026/05/14/raising-the-bar-together-introducing-the-driver-quality-initiative-at-winhec-2026/ |
| 2026-11-17 | Windows endpoint security platform reaching general availability on Windows 11 | VERIFIED | https://blogs.windows.com/windowsexperience/2026/11/17/windows-security-at-ignite-2026-start-secure-protect-what-matters-prepare-for-ai/ |

1. **UMDF.** Microsoft Learn UMDF version history table lists UMDF 1.5 against "Windows Vista WDK / Windows Vista / Windows XP and later"
   (first row of the table; later rows 1.7 Vista SP1/Server 2008, 1.9 Windows 7, 1.11 Windows 8, 2.0 Windows 8.1, ... 2.33 Windows 11 21H2).
   Learn: "Windows Driver Frameworks (WDF) contains UMDF, a framework for the creation of user-mode drivers." Date: Learn gives no calendar
   date; Microsoft's lifecycle page for Windows Vista shows a start date of 1/25/2007 (https://learn.microsoft.com/en-us/lifecycle/products/windows-vista),
   which differs from the commonly cited 30 Jan 2007 general availability and from RTM in Nov 2006 (neither checked). Recommendation: label "2007, Windows Vista (UMDF 1.5)"
   or drop the day. I did not find a Microsoft page that says "UMDF was introduced in 20XX" in those words.
2. **Cloud files API, 1709.** Read 2026-11-23. Microsoft Learn, "Build a Cloud Sync Engine that Supports Placeholder Files": "Windows 10
   version 1709 (also called the Fall Creators Update) introduced the *cloud files API*. This API is a new platform that formalizes support for
   sync engines." and "Sync engines can create placeholder files that consume only 1 KB of storage for the filesystem header, and that
   automatically hydrate into full files under normal use conditions." The Cloud Filter API "provides functionality at the boundary between the
   user mode and the file system"; the sync engine is a desktop app, with the cldflt.sys minifilter as the proxy. The page gives the version, not
   a calendar date; 1709's version number is its release month (October 2017). Label "2017 · 1709".
3. **ProjFS, 1809.** Read 2026-11-23. Microsoft Learn, "Projected File System Programming Guide": "The Windows Projected File System (ProjFS)
   allows a user-mode application called a "provider" to project hierarchical data into the file system, making it appear as files and
   directories in the file system." "Enabling Windows Projected File System"
   (https://learn.microsoft.com/en-us/windows/win32/projfs/enabling-windows-projected-file-system): "ProjFS ships with Windows as an Optional
   Component." The version is the API reference's requirement row, e.g. PrjStartVirtualizing
   (https://learn.microsoft.com/en-us/windows/win32/api/projectedfslib/nf-projectedfslib-prjstartvirtualizing): "Minimum supported client:
   Windows 10, version 1809 [desktop apps only]". The month is the version number's (October 2018). Label "2018 · 1809".
4. **Windows Resiliency Initiative, 19 Nov 2024 (Ignite).** Author David Weston. "We are committed to ensuring that Windows remains the most
   reliable and resilient open platform for our customers. As part of this commitment, we are introducing the Windows Resiliency Initiative,
   covering four areas of focus:" ... "we are developing new Windows capabilities that will allow security product developers to build their
   products outside of kernel mode. This means security products, like anti-virus solutions, can run in user mode just as apps do. This change
   will help security developers provide a high level of security, easier recovery, and there will be less impact to Windows in the event of a
   crash or mistake. A private preview will be made available for our security product ecosystem in July 2025." Also: "kernel attack surfaces,
   like Tool Tips, have been moved to user mode." This post does not use the name "Windows endpoint security platform"; the June 2025 post does.
5. **Windows endpoint security platform, private preview.** Post of 26 June 2025: "Next month, we will deliver a private preview of the Windows
   endpoint security platform to a set of MVI partners. The new Windows capabilities will allow them to start building their solutions to run
   outside the Windows kernel. This means security products like anti-virus and endpoint protection solutions can run in user mode just as apps do.
   This change will help security developers provide a high level of reliability and easier recovery resulting in less impact on Windows devices
   in the event of unexpected issues." The preview date is "July 2025" (a promise); I did not find a Microsoft statement that it started on a given day.
   Newer: Ignite post 17 Nov 2026: "We can now share that the Windows endpoint security platform is reaching general availability on Windows 11. This
   marks an important milestone in Microsoft's work with the security ecosystem to reduce reliance on kernel drivers while preserving the capabilities
   security solutions depend on." Note "reduce reliance", not "remove". Vendor ship dates (Bitdefender, Sophos Q4 2026, ESET Feb 2027) came from
   a secondary report: SNIPPET ONLY.
6. **Windows protected print mode (WPP).** Microsoft Security blog 13 Dec 2023: "We are calling this new platform Windows Protected Print Mode (WPP).
   We believe users should be Secure-by-Default which is why WPP will eventually be on by default in Windows." and "WPP blocks all third-party
   drivers"; "builds on the existing IPP print stack where only Mopria certified printers are supported, and disables the ability to load third-party
   drivers." Pre-history: end-of-servicing plan for third-party printer drivers announced September 2023
   (https://learn.microsoft.com/en-us/windows-hardware/drivers/print/end-of-servicing-plan-for-third-party-printer-drivers-on-windows; "May 2025
   update - Printer driver timeline date adjustment"; "July 1, 2027"). CORRECTED: the announcement is Dec 2023. The "1 Oct 2024" launch date and
   "Windows 11 24H2" availability came from a search snippet and Computer Weekly (secondary): I did not verify availability dates on Learn. Do not
   write "no third-party print drivers in Windows"; WPP is an optional mode that disables them.
7. **Driver Quality Initiative, 14 May 2026.** Windows Experience Blog, "Raising the bar together. Introducing the Driver Quality Initiative at WinHEC
   2026". Architecture pillar: "We are heavily investing in hardening kernel mode drivers and enabling the third-party kernel mode driver
   transition to either user mode driver or Microsoft authored class drivers. This is to ensure higher driver security, reliability and resiliency.
   User-mode driver investments include performance updates to PCIe devices with DMA support as well as Wi-fi stack (coming soon)." and "DQI is a
   partnership." No mandate or deadline in the text. Not a mandate: confirmed.
8. **Quick Machine Recovery.** Announced 19 Nov 2024: "This feature will enable IT administrators to execute targeted fixes from Windows Update on
   PCs, even when machines are unable to boot, without needing physical access to the PC." GA 22 Jul 2025 (Windows IT Pro Blog, Monika Sandhu,
   KB5062660): "this built-in capability automatically detects, diagnoses, and resolves widespread critical boot issues using a secure, always-available
   Windows Recovery Environment." Origin: June 2025 post says QMR is "a recovery mechanism for PCs that cannot restart successfully", enabled by default
   on Windows 11 Home, and admins enable it on Pro/Enterprise.
9. **Why the Resiliency Initiative exists.** Microsoft's own wording on the July 2024 CrowdStrike outage is in the existing research note (refs 18-20); not re-read here.

## The 2025 black screen (Microsoft's own description)

Primary sources:
- Windows IT Pro Blog, "Resilience in action for Windows devices", Monika_Sandhu, 22 Jul 2025:
  https://techcommunity.microsoft.com/blog/windows-itpro-blog/resilience-in-action-for-windows-devices/4434571
- Windows Experience Blog, 26 Jun 2025 (preview of the UI, "available starting later this summer on all Windows 11, version 24H2 devices"):
  https://blogs.windows.com/windowsexperience/2025/06/26/the-windows-resiliency-initiative-building-resilience-for-a-future-ready-enterprise
- Image from the June post (1920x1080 PNG, read directly):
  https://winblogs.thesourcemediaassets.com/sites/2/2025/06/Unexpected-restart-1920-x-1080-1024x576.png

Microsoft's verbatim wording:
- "For nearly four decades, the blue screen shown during an unexpected restart has been a visual shorthand for something going wrong."
- "The new UI is simpler, and more aligned with Windows 11's design language. It removes the frowny face and QR code, and instead presents a short,
  readable message with the stop code and faulty driver information. We've also added a hex version of the stop code to make it easier to search
  for help - a common user request."
- "In Windows 11 24H2, we made significant improvements to crash dump collection that reduced the time users spend on the screen from 40 seconds
  to just 2 seconds for most consumer devices."
- "The new UI for unexpected restarts is now generally available for all devices on Windows 11, 24H2." (22 Jul 2025, KB5062660)
- Image alt text (Microsoft's): "A black screen with a Windows stop code and a short message to the user that Windows is restarting imminently."
- June post: "The updated UI improves readability and aligns better with Windows 11 design principles, while preserving the technical information on the
  screen for when it is needed."

The screen as shown in Microsoft's image (this is a marketing mock-up with a sample stop code, not a real crash):
- Whole frame pure black (#000, no frowny face, no QR code, no logo, no blue).
- Centre, slightly above the vertical middle (about 47 to 54 percent of the height), white/light-grey text in a light sans-serif (Segoe UI-like), centred:
  - line 1: `Your device ran into a problem and needs to restart.`
  - blank line
  - line 2: `0% complete`
- Bottom, centred, about 92 to 95 percent down, very small light-grey text, two lines:
  - `Stop code: CRITICAL_PROCESS_DIED (0xEF)`
  - `What failed: rdbss.sys`
- Nothing else on the screen. Main text is about 3% of the frame height; the bottom lines about 1.3 percent.
- The percentage line is the progress counter; whether it counts up on a real screen was not shown in the still (the image shows "0% complete"). The
  "(0xEF)" hex value is the added "hex version of the stop code". "What failed:" names the faulty driver file.
- CORRECTED against the user's recollection: the on-screen sentence is exactly "Your device ran into a problem and needs to restart." (with the full stop). Percentage
  line reads "0% complete" (no word "restart" after it). The bottom block uses "Stop code:" and "What failed:". The "Windows is restarting imminently" is Microsoft's
  alt text, not on-screen text.
- The 2025 colour: black on 24H2 retail, delivered by KB5062660 (22 Jul 2025). The Insider build in April 2025 showed a green screen (SNIPPET ONLY, press).
  Windows 10 still shows the blue screen with frowny face (SNIPPET ONLY: search summary). Do not claim the latter on the site.

## Dropped (could not source to a primary page)

- A Microsoft page stating UMDF's "introduction year" in words; kept only the UMDF 1.5 / Windows Vista table row.
- The exact macOS 27 release date from Apple (only secondary).
- The exact start day of the Windows endpoint security platform private preview (Microsoft promised "July 2025").
- WPP availability on Windows 11 24H2 / 1 Oct 2024 (secondary only).
- The WWDC19 date printed on Apple's page.
- Anything on Windows "loopback" or other items outside the asked list.

## Suggested events for the site (all exact, all primary-sourced)

Linux: 2005 Oct 27 FUSE in 2.6.14; 2024 May 12 FUSE passthrough (6.9); 2025 Mar 24 FUSE over io_uring (6.14); 2025 Dec 10 Rust no longer experimental.
macOS: 2019 Oct 7 Catalina (System Extensions, DriverKit, kexts deprecated); 2020 Nov Big Sur + Apple silicon (kexts: Reduced Security, deprecated KPIs not loaded by default);
2025 Mar 31 FSKit in 15.4; 2026 macOS 27 (FSKit caller identity and kernel cache control, Apple "June 2026" doc entry).
Windows: Vista UMDF 1.5 (2007); 2017 Oct cloud files API (1709); 2018 Oct ProjFS (1809); 2023 Dec 13 WPP announced; 2024 Nov 19 Resiliency Initiative and QMR announced; 2025 Jun 26 endpoint security platform private-preview plan;
2025 Jul 22 QMR GA and the black screen; 2026 May 14 Driver Quality Initiative; 2026 Nov 17 endpoint security platform GA.
