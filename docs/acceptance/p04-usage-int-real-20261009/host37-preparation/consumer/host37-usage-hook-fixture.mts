// The acceptance-only seam is not a package `exports` entry; this checks the installed declaration by its installed (real) file path, since a relative path through the top-level symlink would not see the package's own dependencies.
import {buildApp, createUsageHookFixture, type BuildOptions, type UsageHookFixture} from '/Users/yzliu/.cache/hanamesh-runs/P04-USAGE-INT-01/host37-prep-3f4f03b6-5e2b-4f69-8461-dbbc5c38bd5c/consumer/node_modules/.pnpm/hanamesh-server@file+vendor+hanamesh-server-0.2.0-rc.37.tgz_7ce5cb8873d527398356057121c206b8/node_modules/hanamesh-server/dist/app.js';
const byBatch: UsageHookFixture = {failOnBatchNumber: 1};
const byArm: UsageHookFixture = {armed: () => true};
const options: BuildOptions = {usageHookFixture: byArm};
// @ts-expect-error failOnBatchNumber is a number
const badBatch: UsageHookFixture = {failOnBatchNumber: '1'};
// @ts-expect-error armed must return boolean
const badArm: UsageHookFixture = {armed: () => 'yes'};
const start: typeof buildApp = buildApp;
const wrap: typeof createUsageHookFixture = createUsageHookFixture;
export {byBatch, options, badBatch, badArm, start, wrap};
