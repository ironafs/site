<!-- SPDX-FileCopyrightText: 2026 Adrian Ana <adrian@adrianana.com> -->
<!-- SPDX-License-Identifier: GPL-3.0-or-later -->

# Licensing

The IronAFS website's **code** is free software under the
[GNU General Public License, version 3 or later](LICENSE)
(`GPL-3.0-or-later`). That is also the licence of
[IronAFS](https://github.com/ironafs/ironafs/blob/main/LICENSING.md).

The GPL covers the code only. The site's **content**, meaning its words and
pictures, and the IronAFS **name and logo** are not free software. All rights
in them are reserved.

| Material | Licence | Where (`REUSE.toml` has the exact paths) |
|---|---|---|
| Code | `GPL-3.0-or-later` | components, layouts, pages, scripts, styles, types and helpers in `src/`; `tests/` (apart from `tests/content/`); `tools/`; `brand/src/` scripts; configuration; CI; `public/intro-gate.js`, `public/robots.txt`; the governance files; `docs/sources/`, `docs/provenance.md` |
| Content | `LicenseRef-AllRightsReserved` ([text](LICENSES/LicenseRef-AllRightsReserved.txt)) | `src/content/` and `tests/content/` (apart from the trademark policy, below), `src/assets/story/`, `src/assets/hero/poster.png` |
| Trademark policy | `GPL-3.0-or-later`, as `TRADEMARKS.md` in [ironafs/ironafs](https://github.com/ironafs/ironafs/blob/main/TRADEMARKS.md) | `src/content/trademarks.ts`, `tests/content/trademarks-canonical.md` (verbatim copies of that file) |
| Name and logo | `LicenseRef-AllRightsReserved`, and [Name and trademark use](https://www.ironafs.org/trademarks/) | `brand/svg/`, `brand/png/`, `brand/icons/`, and their copies in `public/` (the logo, icons and social card) |
| Third-party material | its own | [docs/provenance.md](docs/provenance.md) |

## The code

- **You may** use, study, change and share the code.
- **If you distribute it,** or a work based on it, you must license it under
  the same terms. You must also make its complete corresponding source
  available to the people you give it to, in one of the ways GPLv3 §6 allows.
- **Changes you only use yourself,** or inside your organisation, do not have
  to be published.
- **To reuse or redistribute the code, replace the reserved content.** The
  GPL gives you no rights to the words, the pictures, the name or the logo. A
  copy of this repository, or of the built site, that keeps them is not
  licensed for distribution. The reserved content is a fixed set of paths,
  listed in the table above. Replace `src/content/` with your own words,
  which must match the types in `src/lib/types.ts`. Replace or remove the
  pictures, and use your own name and logo. The code then builds and runs as
  your own site.
- **The code that draws the logo and the 3D word** is code, under the GPL.
  It is in `src/scripts/logo-rust.ts`, `src/components/RustLogo.astro`,
  `src/scripts/hero/` and `brand/src/`. The name and logo it draws with
  IronAFS's words are reserved. The
  [name and trademark policy](https://www.ironafs.org/trademarks/) covers the
  claimed name.

## The content

The words and pictures are under `LicenseRef-AllRightsReserved`: "Copyright
Adrian Ana. All rights reserved."

That permits only what the law already allows without a licence, such as
quotation and fair use. It also permits viewing the site and this
repository. And it permits reproducing the unchanged IronAFS name and logo to
refer accurately to the IronAFS project, for example in articles, talks,
package listings and links. That permission covers the copyright in the
logo's artwork too. How to use the name is explained in the
[name and trademark policy](https://www.ironafs.org/trademarks/).

GitHub's Terms of Service give GitHub's users certain rights to view and fork
public repositories on GitHub. Nothing here extends those rights.

- **Quoting** a sentence or a statistic, with a link to ironafs.org, is
  welcome.
- **The facts are not ours.** The facts and statistics the site cites belong
  to their sources, which are linked beside each one.
- **For anything else,** ask: adrian@adrianana.com.

## File headers

Every file declares its copyright and licence in the format of the
[REUSE](https://reuse.software/) specification, version 3.3. That means SPDX
tags and no licence boilerplate.

- **The governance files** carry the two-line header that IronAFS uses, at
  the top of the file, in the file's own comment syntax:

  ```markdown
  <!-- SPDX-FileCopyrightText: 2026 Adrian Ana <adrian@adrianana.com> -->
  <!-- SPDX-License-Identifier: GPL-3.0-or-later -->
  ```

- **The site's other files** are covered by entries in `REUSE.toml`, by
  path. There are separate path sets for code, reserved content, the name and
  logo, and third-party files. A new file needs nothing if an entry already
  covers its path. A file with a different origin or licence gets its own
  entry.
- **Contributors** may add their own `SPDX-FileCopyrightText` line to a code
  file they create or change substantially, with the year and the name they
  sign off with. Existing lines are never removed or changed. Reserved
  content takes no outside contributions (see
  [CONTRIBUTING.md](CONTRIBUTING.md)).
- **Licence texts** are in `LICENSES/`, named by their SPDX identifier:
  `GPL-3.0-or-later.txt`, `LicenseRef-AllRightsReserved.txt`, `MIT.txt` and
  `OFL-1.1.txt`.
- **Third-party material** keeps its original notice and licence, and gets a
  row in `docs/provenance.md`.
- **`reuse lint` checks all of this.** It must pass before any change lands,
  and CI runs it on pull requests.

## Where the code comes from

Under IronAFS's don't-copy rule
([ADR 0001](https://github.com/ironafs/ironafs/blob/main/docs/adr/0001-licence-and-dont-copy.md)),
the site contains no code from OpenAFS, AuriStor or the Linux kernel's AFS
and Rx implementations.

Third-party material copied into the repository keeps its own licence and
notices, and is listed in [docs/provenance.md](docs/provenance.md). It is a
font, a subset of that font, and the GitHub mark. The built site also ships
parts of its dependencies: three.js, Vite's module preload helper and two
fonts. Their notices and full licence texts are served at
[ironafs.org/licences.txt](https://www.ironafs.org/licences.txt), from
`public/licences.txt`. Dependencies are pinned to exact versions and are
added only when the owner decides to.

## Pictures made with AI

Some of the pictures were made with image models, then chosen, edited and
approved by the maintainer (see [AI.md](AI.md#pictures) and
[docs/provenance.md](docs/provenance.md)). The US Copyright Office's position
is that purely AI-generated material is not protected, but a person's
selection, arrangement and changes can be. The content licence reserves what
can be copyrighted in these pictures. It cannot create rights the law does
not give.
