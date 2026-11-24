import { links } from '../data/links.ts';

export const afsContext = {
  eyebrow: '/what',
  heading: 'A new client for existing AFS-3 cells.',
  lead: "AFS (the Andrew File System) is a distributed file system that has been used by universities, research labs and companies, including large financial firms. A cell is a group of AFS servers managed together; clients reach a cell's files under `/afs/<cell-name>` and cache the files they fetch.",
  diagram: {
    label: 'IronAFS is being designed to share the AFS-3 wire with existing clients to reach AFS cells',
    iron: { title: 'IronAFS', detail: 'new client · user space · in progress' },
    userSpace: 'USER SPACE',
    kernel: 'KERNEL',
    open: { title: 'OpenAFS', detail: 'existing client · in the kernel' },
    wire: 'AFS-3',
    cells: 'AFS servers',
    target: 'first tests planned with OpenAFS 1.8 servers',
    verified: 'end-to-end compatibility unverified',
  },
  definitions: [
    { term: 'AFS-3', description: 'The protocol family IronAFS is being built to speak.' },
    { term: 'OpenAFS', description: 'An existing open-source AFS implementation, with clients and servers.' },
    { term: 'IronAFS', description: 'An independent AFS client written in Rust.' },
  ],
  compatibility: 'IronAFS is being built to work with the cells you already run. Its protocol code follows the published AFS-3 documentation, and the client will be tested against real OpenAFS 1.8 servers before its first release.',
  explore: 'Protocol references',
  resources: [
    { label: 'AFS3 Standardization Group', href: links.standards },
    { label: 'AFS Assigned Numbers Registry', href: links.registry },
  ],
};
