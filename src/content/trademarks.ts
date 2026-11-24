// SPDX-FileCopyrightText: 2026 Adrian Ana <adrian@adrianana.com>
// SPDX-License-Identifier: GPL-3.0-or-later

import { links, repo } from '../data/links.ts';

const ownership = 'IronAFS™ and the IronAFS logo are trademarks of Adrian Ana.';

export const trademarks = {
  title: 'Name and trademark use',
  /** Above the policy and outside it: where the policy comes from, and which repository its words mean. */
  source: "This is the IronAFS trademark policy, copied from the ironafs/ironafs repository; 'this repository' below means that one.",
  onThisPage: 'On this page',
  summaryHeading: 'The short version',
  summary: [ownership, 'Accurate references are welcome without asking.', 'A modified version should say it is modified.'],
  intro: `${ownership} Neither is registered. This page explains how to refer to the project so that people can tell what is the IronAFS project and what is not. It is about the name and the logo only.`,
  claim: {
    heading: 'What is claimed',
    name: 'IronAFS',
    paragraphs: [
      {
        before: 'The claim covers the complete name ',
        after: ' and the IronAFS logo, the IronAFS wordmark with the cube "o". It does not cover AFS, AFS-3, OpenAFS or any other protocol or product name, which this project only refers to. The logo\'s image files are not in this repository and are not covered by its licence.',
      },
      {
        before: 'The name is written ',
        after: ': capital I, lower-case "ron", capital AFS, one word. The ™ sign goes on the prominent brand reference (a title or heading) and in the ownership statement, and not in ordinary prose, paths, commands, URLs or crate names.',
      },
    ],
  },
  rights: {
    heading: 'Your rights under the licence',
    before: 'The software is licensed under GPL-3.0-or-later (',
    label: 'LICENSING.md',
    href: links.licence,
    after: '). The licence grants no trademark rights; this page is about the name and the logo only. Nothing on it adds a condition to the licence, takes away any right the licence grants, or restricts any use the law allows without permission. The licence itself is the permission to use, study, change, fork, sell and redistribute the code, on its terms; you need no separate permission from this project.',
  },
  references: {
    heading: 'Referring to the project',
    intro: "This is guidance on labelling things accurately, so that people can tell the project's own releases from other people's builds.",
    examples: [
      {
        lead: 'Accurate references are welcome',
        text: ' without asking: in articles, documentation, links, talks, and statements such as "works with IronAFS" or "based on IronAFS", as long as they are true.',
      },
      {
        lead: "The project's own releases",
        text: ' are labelled, for example, "IronAFS 1.0, released by the IronAFS project".',
      },
      {
        lead: 'Packages of an unchanged release',
        text: ' can be called IronAFS. A label that also says who built the package, for example "IronAFS 1.0, packaged by Example Linux", tells users where it came from.',
      },
      {
        lead: 'Modified versions',
        text: ' are best labelled as such, with who distributes them, for example "Example AFS, based on IronAFS". Please do not present a modified version as the official IronAFS. A fork may say truthfully where it comes from.',
      },
      {
        lead: 'Endorsement:',
        text: ' please do not suggest that this project endorses, certifies or is affiliated with your product, service or project unless it does.',
      },
    ],
    readme: {
      before: "For the project's own relationship to other AFS software, see the README's ",
      label: 'Licence',
      href: `${repo}#licence`,
      after: ' section.',
    },
  },
  questions: {
    heading: 'Questions',
    before: 'Ask in a ',
    label: 'GitHub issue',
    href: links.issues,
    after: ', or by email to adrian@adrianana.com with "IronAFS name" in the subject.',
  },
};
