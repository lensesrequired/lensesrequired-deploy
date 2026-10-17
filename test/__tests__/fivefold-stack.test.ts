import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { FivefoldStack, jobNames, JobConfig, JobName } from '../../lib/fivefold-stack';

const env = { account: '123456789012', region: 'us-east-1' };
let assetPath: string;
beforeAll(() => {
  assetPath = mkdtempSync(join(tmpdir(), 'fivefold-test-'));
  writeFileSync(join(assetPath, 'index.js'), 'exports.handler = async () => {};');
});
afterAll(() => rmSync(assetPath, { recursive: true, force: true }));
function template(jobs?: Partial<Record<JobName, JobConfig>>) {
  return Template.fromStack(new FivefoldStack(new cdk.App(), 'Test', { env, jobs }));
}

test('retains protected PK/SK storage without duplicating canonical NBA data', () => {
  const t = template();
  t.resourceCountIs('AWS::DynamoDB::GlobalTable', 1);
  t.hasResource('AWS::DynamoDB::GlobalTable', {
    UpdateReplacePolicy: 'Retain', DeletionPolicy: 'RetainExceptOnCreate',
    Properties: Match.objectLike({
      BillingMode: 'PAY_PER_REQUEST',
      KeySchema: [{ AttributeName: 'PK', KeyType: 'HASH' }, { AttributeName: 'SK', KeyType: 'RANGE' }],
      Replicas: [Match.objectLike({ DeletionProtectionEnabled: true,
        PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true } })],
      TimeToLiveSpecification: { AttributeName: 'ttl', Enabled: true },
    }),
  });
  t.resourceCountIs('AWS::Lambda::Function', 0);
  t.resourceCountIs('AWS::Scheduler::Schedule', 0);
  t.resourceCountIs('AWS::IAM::AccessKey', 0);
  t.hasResourceProperties('AWS::S3::Bucket', {
    VersioningConfiguration: { Status: 'Enabled' },
    PublicAccessBlockConfiguration: {
      BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true,
    },
  });
});

test('application policy allows item transactions but not scans, table administration or NBA writes', () => {
  const t = template();
  const policy = Object.values(t.findResources('AWS::IAM::ManagedPolicy'))[0].Properties.PolicyDocument;
  expect(policy.Statement[0].Action).toContain('dynamodb:ConditionCheckItem');
  expect(policy.Statement[1].Action).toEqual(['dynamodb:GetItem', 'dynamodb:BatchGetItem', 'dynamodb:Query']);
  expect(JSON.stringify(policy)).not.toMatch(/dynamodb:(Scan|CreateTable|DeleteTable|\*)/);
  expect(policy.Statement.every((s: { Resource: unknown }) => s.Resource !== '*')).toBe(true);
});

test('jobs have explicit schedules, scoped access, retry and execution failure handling', () => {
  const jobs = Object.fromEntries(jobNames.map(name => [name, {
    assetPath, scheduleExpression: 'cron(0 9 * * ? *)', timeZone: 'America/Denver', enabled: false,
  }])) as Record<JobName, JobConfig>;
  const t = template(jobs);
  t.resourceCountIs('AWS::Lambda::Function', 5);
  t.resourceCountIs('AWS::Scheduler::Schedule', 5);
  t.resourceCountIs('AWS::Lambda::EventInvokeConfig', 5);
  t.resourceCountIs('AWS::CloudWatch::Alarm', 11);
  for (const schedule of Object.values(t.findResources('AWS::Scheduler::Schedule'))) {
    expect(schedule.Properties).toMatchObject({
      State: 'DISABLED', ScheduleExpressionTimezone: 'America/Denver',
      FlexibleTimeWindow: { Mode: 'OFF' },
      Target: { RetryPolicy: { MaximumEventAgeInSeconds: 3600, MaximumRetryAttempts: 3 } },
    });
    expect(schedule.Properties.Target.DeadLetterConfig.Arn).toBeDefined();
  }
  for (const fn of Object.values(t.findResources('AWS::Lambda::Function'))) {
    expect(fn.Properties.Environment.Variables.FIVEFOLD_TABLE).toBeDefined();
    expect(fn.Properties.Environment.Variables.WEEK_TIME_ZONE).toBe('America/Denver');
  }
  const policies = Object.values(t.findResources('AWS::IAM::Policy'));
  const ingestion = policies.find(p => JSON.stringify(p).includes('s3:GetObject*'));
  expect(ingestion).toBeDefined();
  expect(JSON.stringify(ingestion)).not.toContain('GameTable');
  expect(JSON.stringify(policies)).not.toContain('dynamodb:Scan');
});

test('only creates application role with explicit host trust', () => {
  const t = Template.fromStack(new FivefoldStack(new cdk.App(), 'Trust', {
    env, applicationPrincipalArn: 'arn:aws:iam::123456789012:role/FivefoldHost',
  }));
  t.hasResourceProperties('AWS::IAM::Role', {
    AssumeRolePolicyDocument: { Version: '2012-10-17', Statement: [{
      Effect: 'Allow', Action: 'sts:AssumeRole', Principal: { AWS: 'arn:aws:iam::123456789012:role/FivefoldHost' },
    }] },
  });
});

test('rejects incomplete job settings', () => {
  expect(() => template({ lockWeek: { assetPath, scheduleExpression: '', timeZone: 'America/Denver', enabled: false } }))
    .toThrow('Invalid configuration');
});
