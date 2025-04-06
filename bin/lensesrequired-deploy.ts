#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { MovieNightStack } from '../lib/movie-night-stack';

const app = new cdk.App();
new MovieNightStack(app, 'MovieNightStack', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION }
});
