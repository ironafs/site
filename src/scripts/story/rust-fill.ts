// The CSS Rust word's fill: the build's WebP of rust-only, whose URL Rust.astro puts in the host's
// data-fill, becomes the custom property --rw-fill that rust.css paints through the word's radial mask. Set through
// the CSSOM (el.style.setProperty), which the CSP allows; never a style= attribute. Set after the page's `load`
// event: a CSS background loads as soon as its element is laid out, wherever it is (after-load.ts).
import { afterLoad } from './after-load';

export function initRustFill(root: ParentNode = document): void {
  afterLoad(() => {
    for (const host of root.querySelectorAll<HTMLElement>('.rust-word[data-fill]')) {
      const url = host.dataset.fill;
      if (url) host.style.setProperty('--rw-fill', `url(${JSON.stringify(url)})`);
    }
  });
}
