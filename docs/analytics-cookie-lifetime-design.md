<!-- SPDX-FileCopyrightText: 2026 Adrian Ana <adrian@adrianana.com> -->
<!-- SPDX-License-Identifier: GPL-3.0-or-later -->

# Enforce the IronAFS analytics cookie lifetime

Class S. IronAFS tells visitors its analytics cookies last up to 30 days. Live Chromium with the real Google tag, collection requests blocked, received two-year expiry attempts for fresh cookies even though the stream config included 2,592,000 seconds. Chrome stored both for 400 days. Setting expiry and update behavior globally before consent and tag initialization produced 30-day cookies. The global command alone left a seeded long-lived _ga in place. A new site-specific prefix produced two 30-day cookies without using either old name.

## Behavior

Queue a global Google tag settings command before the consent defaults, grant, initialization and stream configuration. Use a site-specific `ironafs` prefix, a 30-day expiry and `cookie_update: false`. Keep explicit stream settings consistent with the global command. Keep the existing sanitized view, regional eligibility, denied ad settings, Global Privacy Control, and withdrawal flow.

After determining analytics is enabled and just before loading the tag, expire the exact two old names, `_ga` and `_ga_RZM2LM714L`, at Path=/ for the host and its parent domain using the existing removal mechanism. They cannot seed the new prefixed names. The existing off path must remove the two current names as well as the two old names. Use exact names for the new namespace and keep the existing generic GA withdrawal cleanup. This introduces no migration cookie or browser storage key. A returning browser gets a new analytics identifier once. Existing unprefixed cookies are retired on the next visit where JavaScript runs.

The policy and Cookie settings list the new names and explain that each write is set to expire within 30 days. Do not claim the session cookie keeps the same absolute expiry across new sessions, since the real tag rewrote an existing short-lived session cookie when starting a new session even with cookie updates disabled. Explain that the separate two-month setting is for data stored by Google and the new-activity reset applies to user-level data.

## Verification

Use mocked external requests in CI. A regression must demonstrate startup receives the 30-day global setting before initialization, cleanup retires the two seeded legacy cookies before the tag request, a returning page keeps the new cookies, and withdrawal clears their two new names while preserving an unrelated cookie. Existing consent, regional default and GPC checks remain in force. Independently run a fresh Chromium context against the real tag with all collection calls blocked and inspect cookie expiry, including a returning context seeded with two long-lived legacy cookies. Do not export any actual visitor's cookies or send test page views to the property.

References

- [Google tag configuration](https://developers.google.com/analytics/devguides/collection/ga4/reference/config)
- [GA4 cookie defaults](https://support.google.com/analytics/answer/11397207)
- [Google data retention](https://support.google.com/analytics/answer/7667196)
- [Chromium maximum cookie expiry](https://developer.chrome.com/blog/cookie-max-age-expires)

Written by codex:gpt-6.2-sol for the maintainer.
