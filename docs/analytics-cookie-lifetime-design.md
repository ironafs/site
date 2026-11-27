<!-- SPDX-FileCopyrightText: 2026 Adrian Ana <adrian@adrianana.com> -->
<!-- SPDX-License-Identifier: GPL-3.0-or-later -->

# Enforce the IronAFS analytics cookie lifetime

Class S. IronAFS tells visitors its analytics cookies last up to 30 days. Live Chromium with the real Google tag, collection requests blocked, received two-year expiry attempts for fresh cookies even though the stream config included 2,592,000 seconds. Chrome stored both for 400 days. Setting expiry and update behavior globally before consent and tag initialization produced 30-day cookies. The global command alone left a seeded long-lived _ga in place. A new site-specific prefix produced two 30-day cookies without using either old name.

## Behavior

Queue a global Google tag settings command before the consent defaults, grant, initialization and stream configuration. Use a site-specific `ironafs` prefix, a 30-day expiry and `cookie_update: false`. Keep explicit stream settings consistent with the global command. Keep the existing sanitized view, regional eligibility, denied ad settings, Global Privacy Control, and withdrawal flow.

At analytics initialization, before any consent branching or tag loading, expire the two old names, `_ga` and `_ga_RZM2LM714L`, at Path=/. Reuse the existing removal mechanism for host-only cookies and explicit Domain attributes for the current hostname and each ancestor up to the public suffix. The deployment serves www.ironafs.org. The real tag with the tested prefix wrote exactly `ironafs_ga` and `ironafs_ga_RZM2LM714L`, as observed from Chromium cookie metadata. Use those same names for the new namespace in the off path and policy. Keep the existing generic GA withdrawal cleanup. This introduces no migration cookie or browser storage key. A returning browser gets a new analytics identifier once. Legacy cookies are retired on the next visit where the site runs its analytics initialization.

The policy and Cookie settings list the new names. State that Google Analytics sets these cookies with an expiry of up to 30 days and starting a new analytics session can set a fresh session cookie. The policy and cookie table must both avoid implying a fixed absolute end date across new sessions, since the real tag rewrote an existing short-lived session cookie when starting a new session even with cookie updates disabled. Explain that the separate two-month setting is for data stored by Google and the new-activity reset applies to user-level data.

## Verification

Use mocked external requests in CI. A regression must verify the full global cookie settings command precedes consent defaults, grant and initialization. Seed legacy cookies to confirm their immediate removal under a saved grant, stored denial, regional default-off without a decision and GPC. A returning page retains the new names while allowed, and withdrawal clears both of them while preserving an unrelated cookie. Existing eligibility checks remain in force. Independently run a fresh Chromium context against the real tag with all collection calls blocked and inspect cookie expiry, including a returning context seeded with two long-lived legacy cookies. Do not export any actual visitor's cookies or send test page views to the property.

References

- [Google tag configuration](https://developers.google.com/analytics/devguides/collection/ga4/reference/config)
- [GA4 cookie defaults](https://support.google.com/analytics/answer/11397207)
- [Google data retention](https://support.google.com/analytics/answer/7667196)
- [Chromium maximum cookie expiry](https://developer.chrome.com/blog/cookie-max-age-expires)

Written by codex:gpt-6.2-sol for the maintainer.
