// The legal pages' contents: the link of the section being read is aria-current. That is the last heading whose top
// is at or above the selection line, 30% down the viewport. The observer's band runs from the viewport's top to that
// same line, in pixels of the viewport's height (an observer resolves a percentage margin against the root's width on
// some engines), so every heading crossing the line updates the mark; it is rebuilt when the viewport's height changes.
const navigation = document.querySelector<HTMLElement>('.document-toc');
const links = [...document.querySelectorAll<HTMLAnchorElement>('.document-toc a')];
const headings = links.map(link => document.getElementById(link.hash.slice(1))).filter((heading): heading is HTMLElement => heading !== null);
const LINE = 0.3;

if (navigation && 'IntersectionObserver' in window) {
  const update = () => {
    const threshold = window.innerHeight * LINE;
    let current = headings[0];
    for (const heading of headings) {
      if (heading.getBoundingClientRect().top <= threshold) current = heading;
    }
    for (const link of links) {
      if (current && link.hash === `#${current.id}`) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
  };
  let observer: IntersectionObserver | null = null;
  let height = 0;
  const observe = () => {
    if (window.innerHeight === height) return;
    height = window.innerHeight;
    observer?.disconnect();
    observer = new IntersectionObserver(update, { rootMargin: `0px 0px ${-Math.round(height * (1 - LINE))}px 0px`, threshold: 0 });
    headings.forEach(heading => observer!.observe(heading));
  };
  observe();
  window.addEventListener('resize', () => { observe(); update(); });
  update();
}
