#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { MovieNightStack } from '../lib/movie-night-stack';
import { JournalStack } from "../lib/journal-stack";
import {CourtographStack, CourtographSyncConfig} from "../lib/courtograph-stack";

const app = new cdk.App();
new MovieNightStack(app, 'MovieNightStack', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION }
});
new JournalStack(app, 'JournalStack', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION }
});
const syncEnabledContext = app.node.tryGetContext('courtographSyncEnabled');
const courtographSync: CourtographSyncConfig = {
  driveFolderId: app.node.tryGetContext('courtographDriveFolderId') ?? '1AUlATK2q3pqF0JHgkl3gP1P0DRVu_6T3',
  enabled: syncEnabledContext === true || syncEnabledContext === 'true',
};
new CourtographStack(app, 'CourtographStack', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
  sync: courtographSync,
});

// NBA Rivals / Fivefold resources are isolated from existing application stacks.
import { FivefoldStack, FivefoldStackProps } from '../lib/fivefold-stack';
const rawJobs = app.node.tryGetContext('fivefoldJobs');
const jobs: FivefoldStackProps['jobs'] = typeof rawJobs === 'string' ? JSON.parse(rawJobs) : rawJobs;
new FivefoldStack(app, 'FivefoldStack', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
  courtographTableName: app.node.tryGetContext('courtographTableName'),
  applicationPrincipalArn: app.node.tryGetContext('applicationPrincipalArn'),
  jobs,
});
