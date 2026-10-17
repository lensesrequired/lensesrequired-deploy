import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as destinations from 'aws-cdk-lib/aws-lambda-destinations';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as scheduler from 'aws-cdk-lib/aws-scheduler';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';

export const jobNames = ['openWeek', 'lockWeek', 'recalculateScores', 'finalizeWeek', 'ingest'] as const;
export type JobName = typeof jobNames[number];
export interface JobConfig {
  /** Directory containing a compiled Node.js 22 index.handler and its dependencies. */
  assetPath: string;
  scheduleExpression: string;
  timeZone: string;
  enabled: boolean;
}
export interface FivefoldStackProps extends cdk.StackProps {
  courtographTableName?: string;
  /** Existing host role allowed to assume the application role; omitted means no app trust. */
  applicationPrincipalArn?: string;
  jobs?: Partial<Record<JobName, JobConfig>>;
}

const readActions = ['dynamodb:GetItem', 'dynamodb:BatchGetItem', 'dynamodb:Query'];
// DynamoDB authorizes transactions through their constituent item operations.
const writeActions = [...readActions, 'dynamodb:PutItem', 'dynamodb:UpdateItem',
  'dynamodb:DeleteItem', 'dynamodb:BatchWriteItem', 'dynamodb:ConditionCheckItem'];

export class FivefoldStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: FivefoldStackProps = {}) {
    super(scope, id, props);
    for (const name of Object.keys(props.jobs ?? {})) {
      if (!(jobNames as readonly string[]).includes(name)) throw new Error(`Unknown job: ${name}`);
    }
    const table = new dynamodb.TableV2(this, 'GameTable', {
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billing: dynamodb.Billing.onDemand(),
      deletionProtection: true,
      timeToLiveAttribute: 'ttl',
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: cdk.RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
    });
    const nba = dynamodb.Table.fromTableName(this, 'ExistingCourtographTable',
      props.courtographTableName ?? 'courtograph-table-v2');
    const archive = new s3.Bucket(this, 'RawArchive', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    const sessionSecret = new secretsmanager.Secret(this, 'SessionSecret', {
      generateSecretString: { passwordLength: 64, excludePunctuation: true },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    // Populate this JSON secret out of band with unattended source credentials.
    const sourceSecret = new secretsmanager.Secret(this, 'SourceCredentials', {
      generateSecretString: { secretStringTemplate: '{"configured":false}', generateStringKey: 'placeholder' },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    const appPolicy = new iam.ManagedPolicy(this, 'ApplicationPolicy', {
      statements: [
        new iam.PolicyStatement({ actions: writeActions, resources: [table.tableArn] }),
        new iam.PolicyStatement({ actions: readActions, resources: [nba.tableArn, `${nba.tableArn}/index/*`] }),
        new iam.PolicyStatement({ actions: ['secretsmanager:GetSecretValue'], resources: [sessionSecret.secretArn] }),
      ],
    });
    if (props.applicationPrincipalArn) {
      const role = new iam.Role(this, 'ApplicationRole', {
        assumedBy: new iam.ArnPrincipal(props.applicationPrincipalArn),
        managedPolicies: [appPolicy],
      });
      new cdk.CfnOutput(this, 'ApplicationRoleArn', { value: role.roleArn });
    }
    const topic = new sns.Topic(this, 'OperationalAlerts');
    const failures = new sqs.Queue(this, 'JobFailures', {
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      enforceSSL: true,
      retentionPeriod: cdk.Duration.days(14),
    });
    const alarm = (name: string, metric: cloudwatch.IMetric, threshold = 1) => {
      const result = new cloudwatch.Alarm(this, name, {
        metric, threshold, evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
      result.addAlarmAction(new actions.SnsAction(topic));
    };
    alarm('JobFailuresAlarm', failures.metricApproximateNumberOfMessagesVisible({ statistic: 'Maximum' }));
    for (const name of jobNames) {
      const config = props.jobs?.[name];
      if (!config) continue;
      if (!config.assetPath || !/^(cron|rate)\(.+\)$/.test(config.scheduleExpression)
          || !config.timeZone || typeof config.enabled !== 'boolean') {
        throw new Error(`Invalid configuration for ${name}: assetPath, cron/rate, timeZone and boolean enabled required`);
      }
      new Intl.DateTimeFormat('en-US', { timeZone: config.timeZone });
      const logGroup = new logs.LogGroup(this, `${name}Logs`, {
        retention: logs.RetentionDays.ONE_MONTH, removalPolicy: cdk.RemovalPolicy.RETAIN,
      });
      const fn = new lambda.Function(this, `${name}Function`, {
        runtime: lambda.Runtime.NODEJS_22_X,
        handler: 'index.handler', code: lambda.Code.fromAsset(config.assetPath),
        timeout: cdk.Duration.minutes(15), memorySize: 1024,
        reservedConcurrentExecutions: 1, logGroup,
        environment: {
          FIVEFOLD_TABLE: table.tableName, COURTOGRAPH_TABLE: nba.tableName,
          JOB_NAME: name, WEEK_TIME_ZONE: 'America/Denver',
          ...(name === 'ingest' ? { RAW_ARCHIVE_BUCKET: archive.bucketName,
            SOURCE_CREDENTIALS_SECRET_ARN: sourceSecret.secretArn } : {}),
        },
        retryAttempts: 2, maxEventAge: cdk.Duration.hours(6),
        onFailure: new destinations.SqsDestination(failures),
      });
      fn.addToRolePolicy(new iam.PolicyStatement({
        actions: name === 'ingest' ? writeActions : readActions,
        resources: [nba.tableArn, `${nba.tableArn}/index/*`],
      }));
      if (name !== 'ingest') {
        fn.addToRolePolicy(new iam.PolicyStatement({ actions: writeActions, resources: [table.tableArn] }));
      } else {
        archive.grantReadWrite(fn);
        sourceSecret.grantRead(fn);
      }
      const scheduleRole = new iam.Role(this, `${name}ScheduleRole`, {
        assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com', {
          conditions: { StringEquals: { 'aws:SourceAccount': this.account } },
        }),
      });
      fn.grantInvoke(scheduleRole);
      failures.grantSendMessages(scheduleRole);
      new scheduler.CfnSchedule(this, `${name}Schedule`, {
        flexibleTimeWindow: { mode: 'OFF' },
        scheduleExpression: config.scheduleExpression,
        scheduleExpressionTimezone: config.timeZone,
        state: config.enabled ? 'ENABLED' : 'DISABLED',
        target: {
          arn: fn.functionArn, roleArn: scheduleRole.roleArn,
          input: JSON.stringify({ job: name, scheduledTime: '<aws.scheduler.scheduled-time>' }),
          retryPolicy: { maximumEventAgeInSeconds: 3600, maximumRetryAttempts: 3 },
          deadLetterConfig: { arn: failures.queueArn },
        },
      });
      alarm(`${name}Errors`, fn.metricErrors({ statistic: 'Sum' }));
      alarm(`${name}Throttles`, fn.metricThrottles({ statistic: 'Sum' }));
      new cdk.CfnOutput(this, `${name}FunctionArn`, { value: fn.functionArn });
    }
    for (const [key, value] of Object.entries({
      FivefoldTable: table.tableName, AwsRegion: this.region, CourtographTable: nba.tableName,
      ApplicationPolicyArn: appPolicy.managedPolicyArn, SessionSecretArn: sessionSecret.secretArn,
      SourceCredentialsSecretArn: sourceSecret.secretArn, RawArchiveBucket: archive.bucketName,
      JobFailuresQueueUrl: failures.queueUrl, OperationalAlertsTopicArn: topic.topicArn,
    })) new cdk.CfnOutput(this, key, { value });
  }
}
