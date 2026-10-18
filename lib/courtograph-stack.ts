import * as cdk from 'aws-cdk-lib';
import {SecretValue} from 'aws-cdk-lib';
import {Construct} from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as destinations from 'aws-cdk-lib/aws-lambda-destinations';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as scheduler from 'aws-cdk-lib/aws-scheduler';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import {join} from 'node:path';

export interface CourtographSyncConfig {
  driveFolderId: string;
  enabled: boolean;
}

export interface CourtographStackProps extends cdk.StackProps {
  sync?: CourtographSyncConfig;
}

export class CourtographStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CourtographStackProps = {}) {
    super(scope, id, props);

    const table = new dynamodb.TableV2(this, 'CourtographTable2', {
      tableName: 'courtograph-table-v2',
      billing: dynamodb.Billing.onDemand({
        maxReadRequestUnits: 20,
        maxWriteRequestUnits: 1000
      }),
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },

      deletionProtection: true,
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
    });

    table.addGlobalSecondaryIndex({
      indexName: 'PerSeasonIndex',
      partitionKey: { name: 'seasonId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
      maxReadRequestUnits: 5,
      maxWriteRequestUnits: 1000
    })

    table.addGlobalSecondaryIndex({
      indexName: 'GamesPerIndex',
      partitionKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'gameId', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
      maxReadRequestUnits: 5,
      maxWriteRequestUnits: 1000
    })

    const execUser = new iam.User(this, 'CourtographUser', {
      userName: 'courtograph-exec-user'
    })
    execUser.attachInlinePolicy(new iam.Policy(this, 'CourtographExecPolicy', {
      statements: [
        new iam.PolicyStatement({
          sid: 'DynamoDBReadAccess',
          actions: [
            "dynamodb:List*",
            "dynamodb:DescribeReservedCapacity*",
            "dynamodb:DescribeLimits",
            "dynamodb:DescribeTimeToLive"
          ],
          resources: ['*']
        }),
        new iam.PolicyStatement({
          sid: 'DynamoDBWriteAccess',
          actions: [
            "dynamodb:BatchGet*",
            "dynamodb:DescribeStream",
            "dynamodb:DescribeTable",
            "dynamodb:Get*",
            "dynamodb:Query",
            "dynamodb:Scan",
            "dynamodb:BatchWrite*",
            "dynamodb:CreateTable",
            "dynamodb:Delete*",
            "dynamodb:Update*",
            "dynamodb:PutItem"
          ],
          resources: [table.tableArn, `${table.tableArn}/*`]
        })
      ]
    }))
    execUser.node.addDependency(table)

    const accessKey = new iam.AccessKey(this, 'CourtographExecUserAccessKey', { user: execUser });
    accessKey.node.addDependency(execUser);

    const secret = new secretsmanager.Secret(this, 'CourtographAccessKeySecret', {
      secretObjectValue: {
        Username: SecretValue.unsafePlainText(execUser.userName),
        AccessKeyId: SecretValue.unsafePlainText(accessKey.accessKeyId),
        SecretAccessKey: accessKey.secretAccessKey
      },
    });
    secret.node.addDependency(accessKey)

    if (props.sync) {
      if (!/^[A-Za-z0-9_-]+$/.test(props.sync.driveFolderId)) {
        throw new Error('Courtograph Drive folder ID must be a Google Drive ID, not a URL');
      }

      const syncArchive = new s3.Bucket(this, 'CourtographSyncArchive', {
        encryption: s3.BucketEncryption.S3_MANAGED,
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        enforceSSL: true,
        versioned: true,
        removalPolicy: cdk.RemovalPolicy.RETAIN,
      });
      const driveSecret = new secretsmanager.Secret(this, 'CourtographDriveOAuthCredentials', {
        description: 'OAuth client and refresh token for read-only Courtograph Drive sync.',
        secretObjectValue: {
          client_id: SecretValue.unsafePlainText(''),
          client_secret: SecretValue.unsafePlainText(''),
          refresh_token: SecretValue.unsafePlainText(''),
        },
        removalPolicy: cdk.RemovalPolicy.RETAIN,
      });
      const failures = new sqs.Queue(this, 'CourtographSyncFailures', {
        encryption: sqs.QueueEncryption.SQS_MANAGED,
        enforceSSL: true,
        retentionPeriod: cdk.Duration.days(14),
      });
      const alerts = new sns.Topic(this, 'CourtographSyncAlerts');
      const logGroup = new logs.LogGroup(this, 'CourtographSyncLogs', {
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: cdk.RemovalPolicy.RETAIN,
      });
      const sync = new lambda.Function(this, 'CourtographSyncFunction', {
        functionName: `${this.stackName}-CourtographSyncFunction`,
        runtime: lambda.Runtime.NODEJS_22_X,
        handler: 'index.handler',
        code: lambda.Code.fromAsset(join(__dirname, '../jobs/courtograph-sync/dist')),
        timeout: cdk.Duration.minutes(15),
        memorySize: 2_048,
        ephemeralStorageSize: cdk.Size.mebibytes(512),
        reservedConcurrentExecutions: 1,
        // Checkpointed backfills can legitimately span more than 16 invocations.
        recursiveLoop: lambda.RecursiveLoop.ALLOW,
        logGroup,
        environment: {
          DRIVE_FOLDER_ID: props.sync.driveFolderId,
          DRIVE_OAUTH_SECRET_ARN: driveSecret.secretArn,
          COURTOGRAPH_TABLE_NAME: table.tableName,
          SYNC_ARCHIVE_BUCKET: syncArchive.bucketName,
          WRITE_UNITS_PER_SECOND: '700',
        },
        retryAttempts: 2,
        maxEventAge: cdk.Duration.hours(6),
        onFailure: new destinations.SqsDestination(failures),
      });
      sync.addToRolePolicy(new iam.PolicyStatement({
        actions: ['dynamodb:BatchWriteItem'],
        resources: [table.tableArn],
      }));
      sync.addToRolePolicy(new iam.PolicyStatement({
        actions: ['s3:GetObject', 's3:PutObject'],
        resources: [syncArchive.arnForObjects('*')],
      }));
      driveSecret.grantRead(sync);
      sync.addToRolePolicy(new iam.PolicyStatement({
        actions: ['lambda:InvokeFunction'],
        resources: [this.formatArn({
          service: 'lambda',
          arnFormat: cdk.ArnFormat.COLON_RESOURCE_NAME,
          resource: 'function',
          resourceName: `${this.stackName}-CourtographSyncFunction`,
        })],
      }));

      const scheduleRole = new iam.Role(this, 'CourtographSyncScheduleRole', {
        assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com', {
          conditions: {StringEquals: {'aws:SourceAccount': this.account}},
        }),
      });
      sync.grantInvoke(scheduleRole);
      failures.grantSendMessages(scheduleRole);
      new scheduler.CfnSchedule(this, 'CourtographSyncSchedule', {
        flexibleTimeWindow: {mode: 'OFF'},
        scheduleExpression: 'rate(1 day)',
        state: props.sync.enabled ? 'ENABLED' : 'DISABLED',
        target: {
          arn: sync.functionArn,
          roleArn: scheduleRole.roleArn,
          input: JSON.stringify({source: 'google-drive'}),
          retryPolicy: {maximumEventAgeInSeconds: 3600, maximumRetryAttempts: 3},
          deadLetterConfig: {arn: failures.queueArn},
        },
      });

      const alarm = (constructId: string, metric: cloudwatch.IMetric) => {
        const result = new cloudwatch.Alarm(this, constructId, {
          metric,
          threshold: 1,
          evaluationPeriods: 1,
          comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
          treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        });
        result.addAlarmAction(new actions.SnsAction(alerts));
      };
      alarm('CourtographSyncErrorsAlarm', sync.metricErrors({statistic: 'Sum'}));
      alarm('CourtographSyncThrottlesAlarm', sync.metricThrottles({statistic: 'Sum'}));
      alarm('CourtographSyncQueueAlarm', failures.metricApproximateNumberOfMessagesVisible({statistic: 'Maximum'}));

      for (const [key, value] of Object.entries({
        CourtographDriveOAuthSecretArn: driveSecret.secretArn,
        CourtographSyncArchiveBucketName: syncArchive.bucketName,
        CourtographSyncFailuresQueueUrl: failures.queueUrl,
        CourtographSyncFunctionArn: sync.functionArn,
        CourtographSyncAlertsTopicArn: alerts.topicArn,
      })) {
        const output = new cdk.CfnOutput(this, `${key}Output`, {value});
        output.overrideLogicalId(key);
      }
    }
  }
}
