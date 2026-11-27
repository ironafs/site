<!-- SPDX-FileCopyrightText: 2026 Adrian Ana <adrian@adrianana.com> -->
<!-- SPDX-License-Identifier: GPL-3.0-or-later -->

# Preserve reading position when closing header controls

Class P. At a scroll position of 380px on the Privacy page, closing the mobile menu or desktop command shell in WebKit jumps the document to 321px or 317px respectively. Chromium preserves the position. Both WebKit dialogs preserve the position if explicit focus restoration to their sticky header control uses preventScroll. The same WebKit defect was also reproduced on a scrolled homepage.

On close, return keyboard focus to the mobile menu opener without scrolling. The desktop command shell must restore focus to the previous control as before. If that control is in the sticky header, suppress the scroll associated with restoring focus. If the shell was opened with focus in the document, keep its existing focus restoration behavior. Other dialog actions, the Back history entry, menu section navigation, motion settings and the header styling keep their existing behavior.

In browser tests, open and close both controls on a scrolled document page. Assert that their buttons regain focus and the reading position stays within one pixel of the pre-open position. Use a direct tap or click at the visible sticky button's coordinates to avoid test automation pre-scrolling the page. Keep the existing checks for shell Escape, menu Back, and same-page and cross-page navigation.

Written by codex:gpt-6.2-sol for the maintainer.
