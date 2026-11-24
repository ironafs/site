# IronAFS brand files

The IronAFS logo: the word **IronAFS** in Space Grotesk Bold, with the **iron cell** (iron's
body-centred cubic crystal: eight corner atoms and a glowing core) as the "o". "Iron" is steel;
"AFS" is rusted. The mark on its own is the cell.

## Which file to use

| You need | Use |
|---|---|
| The logo on a dark background | `svg/ironafs-logo-on-dark.svg` (or `png/ironafs-logo-on-dark-*.png`) |
| The logo on a light background | `svg/ironafs-logo-on-light.svg` (or `png/ironafs-logo-on-light-*.png`) |
| The mark alone, 64 px and up | `svg/ironafs-mark.svg`, or `ironafs-mark-on-light.svg` on light backgrounds |
| The mark alone, 16 to 48 px | `svg/ironafs-mark-small.svg` (thicker edges, no diagonals) |
| Website icons | everything in `icons/` (see the snippet below) |
| Social preview (Open Graph, GitHub, chat links) | `icons/og-image.png`, 1200 × 630 |

The PNGs are transparent and come in 512, 1024, 2048 and 4096 px wide (logo) and 128 to 2048 px
(mark). For print, use the SVGs.

The SVGs need no font: the letters are outlines. The rust texture is an SVG filter, which every
browser (and GitHub) renders. A program that ignores SVG filters shows plain rust-orange letters
instead, which is an acceptable fallback.

## On the website

Copy the files in `icons/` to the site root, then in `<head>`:

```html
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#0d0e10">
<meta property="og:image" content="https://www.ironafs.org/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
```

`favicon.svg` follows the browser's light or dark mode by itself.

## In the GitHub README

GitHub can switch the logo with the reader's theme:

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/brand/ironafs-logo-on-dark.svg">
  <img alt="IronAFS" src="docs/brand/ironafs-logo-on-light.svg" width="420">
</picture>
```

For the repository's social preview (Settings → Social preview), upload `icons/og-image.png`.

## Colours

| | Hex |
|---|---|
| Background, dark | `#0d0e10` |
| Background, light | `#f6f4f0` |
| Steel (on dark) | `#e6e9ed` → `#8f959d` |
| Gunmetal (on light) | `#6d737c` → `#24272c` |
| Rust | `#c8571f` → `#7c2c0f` |
| Accent / links | `#d8662a` |
| Core glow | `#fff0c8` → `#ff9a40` → `#b8400e` |

## Rebuilding

The files are generated; edit the scripts, not the outputs.

```sh
cd src
python build_svgs.py          # needs fontTools (pip install fonttools)
node render_pngs.cjs          # needs Playwright with Chrome, and ImageMagick (`magick`)
```

`build_svgs.py` holds the geometry: the cell's viewing angle (`YAW`, `PITCH`, chosen so the cell
reads as a cube and no corner atom covers the core), its size and position in the word, and the
colours. The font is in `src/fonts/` with its licence (SIL Open Font License 1.1).

The animated logo for the website (the cell turning, the rust spreading over AFS, hover burning it
off) is part of the site's code, not of these files.
