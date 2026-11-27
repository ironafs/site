<!-- SPDX-FileCopyrightText: 2026 Adrian Ana <adrian@adrianana.com> -->
<!-- SPDX-License-Identifier: GPL-3.0-or-later -->

# Publish the approved homepage revision

Class P. Update the main page as one coordinated story and navigation change. The published file-read section, public routes, the homepage section IDs and command-palette targets, analytics consent behavior, existing assets' licences, hosting and response headers are part of the baseline.

Keep the existing section IDs `#hero`, `#why`, `#numbers`, `#cost`, `#platforms`, `#what`, `#design`, `#rust`, `#rust-cards`, `#speed`, `#status`, `#built`, `#follow` and `#site-footer`. Footer page links show Why, What, Design, Status and Built under their existing slash labels, and keep pointing to the homepage from secondary pages. The command palette keeps its targets.

## Opening and platforms

- Keep “AFS in user space” and the explanation that IronAFS adds no kernel module, kext or driver. The console says “Kernel crash examples”, with a visible Replay label and an inset keyboard focus indicator. The painted frame grows with the transcript while the layout reserves its final size. On narrow screens the title and usable 44px playback controls fit above the art. Retain the current completion rule: the console records the existing intro-seen flag when the opening finishes typing or the scene explicitly completes an accepted fallback. A reload after that point shows the complete transcript. Add no browser storage or consent dependency. Reduced-motion and no-script views show the complete transcript and explanatory copy. Offer Replay only when its script is active.
- In the enhanced crash sequence, count through at least 35% of the scroll timeline, hold at 100% for at least 8 percentage points and spread the monitor shutdown across at least 15 percentage points. Keep the static or reduced-motion copy complete, and the animation tied to story progress in both directions.
- Keep the Windows, macOS, Linux and IronAFS cards readable even as steps receive scroll-driven emphasis. Present Windows release signing and local testing, the macOS startup security settings, and Debian DKMS and Secure Boot with readable headings and working primary-source links. The platform illustrations illustrate policy or workflow, including platform-specific exceptions where relevant.
- Say the Windows design connects built-in SMB to a local IronAFS SMB 3.1.1 server, without an IronAFS driver. The connection probe captured the first packet at a local TCP listener on all three tested builds while Windows file sharing remained available. The planned prototype will exercise full SMB 3.1.1 sessions, including authentication, signing and per-user access. Link the measured result and keep Windows planning status visible.

## Rust and project progress

- Lead with why safe Rust is useful for reading data from a fileserver. Show the checked XDR regression fixture with the declared five bytes and the two available, then the decoder error. Link the actual safe bounds checks and test. Keep the project rationale distinct from Android data.
- Show the source-attributed Android share values, with the 2025 upper bound identified as below 20%, then the separate per-million-line density estimates. Start each share bar separately, about one quarter of the share reveal apart, so its label can be read before the next bar rises. Keep the full chart visible on short viewports, in reduced motion, and without JavaScript. Remove the redundant caption about the dots while keeping their scale and the methodologies clear. Keep the Android review and rollback figures in a disclosure with the correct comparison group.
- Explain the proposed access and cache-freshness rules and the Linux FUSE precedent. Retain the access and cache checks and the Mountpoint and architecture links. Keep the existing published read diagram and benchmark section.
- State which work exists and what is planned in Status. Keep the read-only Linux client and concurrent Windows SMB session and identity prototype as planned work, with a direct milestones link.

## How it is built and where to go next

- Lead the build section with maintainer responsibility, independent reviews and the published file-read pull request as an example. Use accessible disclosures for change classes, model families and roles, and source provenance and commit attribution. Preserve the exact meaning of the published project workflow, DCO, licence, and review records. Keep disclosures and reference links keyboard accessible without JavaScript.
- Make GitHub the primary follow action and explain its Watch control. Give milestones and design docs clear secondary links. Compact footer navigation and site policies. Link Adrian Ana in the copyright notice to the existing personal site. Put the two distinct software licence links together with the shared identifier. Keep copyright, trademark and affiliation notices, privacy and third-party notices, and the existing cookie settings button. Use small arrows and no underlines for external attribution and licence links, with visible keyboard focus.
- Do not ship the loopback review harness, alternate study pages, development query options, or prototype implementation files. Integrate the approved presentation through the existing Astro components, data modules and styles. Keep analytics and the production pipeline as they are.

## Sources and acceptance evidence

- IronAFS Windows measurements, section 3, and ADR 0004 L15–L22 and L41. Check the protocol and cache claims against ADR 0004 and the public decoder test.
- Compare Android units, reporting periods and percentages to the linked Google reports and the site's Rust source dossier. Check platform references at Microsoft Learn, Apple Platform Security, Linux kernel documentation and the Debian Secure Boot page.
- Check Status and workflow claims against the IronAFS README and milestones, the actual review record for site PR #4, and the published workflow and attribution documents.
- Before merge, build from the website’s main revision. Check the finished and in-progress scenes at 1440×960 and 1024×660 desktop, 390×844 WebKit phone, 320×660 narrow phone and 820×1050 tablet. Include reduced-motion and no-JavaScript modes. Verify anchors, keyboard and touch access, focus visibility, consent banner clearance and the cookie dialog. Run the build tests, REUSE and applicable Playwright suites. Review the final diff and exact squash message.
- For release, wait for main CI after merge and verify the served release against its manifest and the public site after deployment.
