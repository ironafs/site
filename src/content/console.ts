import type { ConsoleLine } from '../lib/types';

export const CONSOLE_LINES: ConsoleLine[] = [
  { cls: 'r', prefix: '[linux  ] ', text: 'Kernel panic - not syncing: Fatal exception', cps: 90, pauseAfterMs: 200 },
  { cls: 'r', prefix: '[macOS  ] ', text: 'panic(cpu 0 caller 0xfffffe0028c3a1f4): Kernel data abort.', cps: 90, pauseAfterMs: 200 },
  { cls: 'r', prefix: '[windows] ', text: 'Stop code: PAGE_FAULT_IN_NONPAGED_AREA', cps: 90, pauseAfterMs: 900 },
  { cls: 'a', prefix: '[ironafs] ', text: 'designed so an IronAFS crash stops /afs, not the machine', cps: 50, pauseAfterMs: 0 },
];
