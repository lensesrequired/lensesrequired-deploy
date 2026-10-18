import * as cdk from 'aws-cdk-lib';
import {Match, Template} from 'aws-cdk-lib/assertions';
import {execFileSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {CourtographStack} from '../lib/courtograph-stack';

const environment = {account: '123456789012', region: 'us-east-1'};
const assetPath = join(__dirname, '../jobs/courtograph-sync/dist');

function buildSyncAsset(): void {
  if (existsSync(join(assetPath, 'index.js'))) return;
  execFileSync('node_modules/.bin/tsc', ['--project', 'jobs/courtograph-sync/tsconfig.json'], {
    cwd: join(__dirname, '..'),
    stdio: 'inherit',
  });
}

beforeAll(buildSyncAsset);

function template(enabled = false): Template {
  const stack = new CourtographStack(new cdk.App(), 'CourtographTest', {
    env: environment,
    sync: {driveFolderId: '1AUlATK2q3pqF0JHgkl3gP1P0DRVu_6T3', enabled},
  });
  return Template.fromStack(stack);
}

test('creates a disabled daily sync with archive, secret, recovery queue, and alarms', () => {
  const synthesized = template();
  synthesized.hasResourceProperties('AWS::DynamoDB::GlobalTable', {
    TableName: 'courtograph-table-v2',
    WriteOnDemandThroughputSettings: {MaxWriteRequestUnits: 1000},
    GlobalSecondaryIndexes: Match.arrayWith([
      Match.objectLike({IndexName: 'PerSeasonIndex', WriteOnDemandThroughputSettings: {MaxWriteRequestUnits: 1000}}),
      Match.objectLike({IndexName: 'GamesPerIndex', WriteOnDemandThroughputSettings: {MaxWriteRequestUnits: 1000}}),
    ]),
  });
  synthesized.resourceCountIs('AWS::Lambda::Function', 1);
  synthesized.hasResourceProperties('AWS::Lambda::Function', {
    Runtime: 'nodejs22.x',
    Handler: 'index.handler',
    Timeout: 900,
    MemorySize: 2048,
    EphemeralStorage: {Size: 512},
    ReservedConcurrentExecutions: 1,
    Environment: {Variables: {
      DRIVE_FOLDER_ID: '1AUlATK2q3pqF0JHgkl3gP1P0DRVu_6T3',
      WRITE_UNITS_PER_SECOND: '700',
    }},
  });
  synthesized.hasResourceProperties('AWS::Scheduler::Schedule', {
    ScheduleExpression: 'rate(1 day)',
    State: 'DISABLED',
  });
  const schedule = Object.values(synthesized.findResources('AWS::Scheduler::Schedule'))[0];
  expect(schedule.Properties.Target.DeadLetterConfig.Arn).toBeDefined();
  synthesized.hasResourceProperties('AWS::S3::Bucket', {
    VersioningConfiguration: {Status: 'Enabled'},
    PublicAccessBlockConfiguration: {
      BlockPublicAcls: true,
      BlockPublicPolicy: true,
      IgnorePublicAcls: true,
      RestrictPublicBuckets: true,
    },
  });
  synthesized.hasResourceProperties('AWS::SecretsManager::Secret', {
    Description: 'OAuth client and refresh token for read-only Courtograph Drive sync.',
  });
  synthesized.resourceCountIs('AWS::CloudWatch::Alarm', 3);
});

test('enables only the requested daily schedule and grants narrowly scoped sync access', () => {
  const synthesized = template(true);
  synthesized.hasResourceProperties('AWS::Scheduler::Schedule', {State: 'ENABLED'});
  const policies = Object.values(synthesized.findResources('AWS::IAM::Policy'));
  const statements = policies.flatMap(policy => policy.Properties?.PolicyDocument?.Statement ?? []);
  const functionProperties = Object.values(synthesized.findResources('AWS::Lambda::Function'))[0].Properties;
  const tableLogicalId = functionProperties.Environment.Variables.COURTOGRAPH_TABLE_NAME.Ref;
  const syncWritePolicy = policies.find(policy => JSON.stringify(policy).includes('dynamodb:BatchWriteItem'));
  expect(syncWritePolicy).toBeDefined();
  const syncPolicyText = JSON.stringify(syncWritePolicy);
  expect(statements).toContainEqual(expect.objectContaining({
    Action: 'dynamodb:BatchWriteItem',
    Resource: { 'Fn::GetAtt': [tableLogicalId, 'Arn'] },
  }));
  expect(JSON.stringify(statements)).toContain('secretsmanager:GetSecretValue');
  expect(JSON.stringify(statements)).toContain('s3:GetObject');
  expect(syncPolicyText).not.toContain('dynamodb:Scan');
});

test('rejects a Drive URL where a folder ID is required', () => {
  expect(() => new CourtographStack(new cdk.App(), 'BadCourtograph', {
    env: environment,
    sync: {driveFolderId: 'https://drive.google.com/drive/folders/example', enabled: false},
  })).toThrow('Courtograph Drive folder ID must be a Google Drive ID, not a URL');
});
