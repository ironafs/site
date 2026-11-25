// Runs before first paint: marks the page when a full typed intro will play (first visit, no reduced
// motion). Mirrors wantsFullIntro in src/scripts/intro.mjs; tests/build/intro.test.mjs keeps them equal.
(function () {
  try {
    var reduced = false;
    try { reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
    var seen = false;
    try { seen = window.localStorage.getItem('ironafs-intro-seen') === '1'; } catch (e) {}
    if (!seen && !reduced) {
      document.documentElement.setAttribute('data-intro', 'play');
      var opening = document.currentScript && document.currentScript.getAttribute('data-phone-opening');
      if (opening && window.matchMedia('(max-width: 899px), (pointer: coarse)').matches) {
        var preload = document.createElement('link');
        preload.rel = 'preload';
        preload.as = 'image';
        preload.href = opening;
        preload.fetchPriority = 'high';
        document.head.appendChild(preload);
      }
    }
  } catch (e) {}
})();
