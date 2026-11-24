// Rewrites src/data/milestones.snapshot.json from the public GitHub API.
// Run by hand (`node tools/milestones.mjs`) or by a scheduled CI job that opens a PR; it never deploys.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const url = 'https://api.github.com/repos/ironafs/ironafs/milestones?state=all&sort=due_on';
const target = fileURLToPath(new URL('../src/data/milestones.snapshot.json', import.meta.url));
const fields = ['number', 'title', 'state', 'open_issues', 'closed_issues', 'html_url'];

const headers = { Accept: 'application/vnd.github+json' };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
const response = await fetch(url, { headers });
if (!response.ok) throw new Error(`GitHub API answered ${response.status}`);
const raw = await response.json();
if (!Array.isArray(raw)) throw new Error('GitHub API did not return an array');
const slim = raw.map(m => Object.fromEntries(fields.map(f => [f, m[f]])));
const fetchedAt = new Date().toISOString().slice(0, 10);
writeFileSync(target, `${JSON.stringify({ fetchedAt, milestones: slim }, null, 2)}\n`);
console.log(`wrote ${slim.length} milestones to ${target}`);
