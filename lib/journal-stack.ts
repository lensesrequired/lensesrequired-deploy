import * as cdk from 'aws-cdk-lib';
import {SecretValue} from 'aws-cdk-lib';
import {Construct} from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import {ProjectionType} from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

export class JournalStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const table = new dynamodb.TableV2(this, 'JournalTable', {
      tableName: 'journal-table',
      billing: dynamodb.Billing.onDemand({
        maxReadRequestUnits: 50,
        maxWriteRequestUnits: 25
      }),
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      deletionProtection: true,
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      }
    });

    const execUser = new iam.User(this, 'JournalUser', {
      userName: 'journal-exec-user'
    })
    execUser.attachInlinePolicy(new iam.Policy(this, 'JournalExecPolicy', {
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

    const accessKey = new iam.AccessKey(this, 'JournalExecUserAccessKey', { user: execUser });
    accessKey.node.addDependency(execUser);

    const secret = new secretsmanager.Secret(this, 'JournalAccessKeySecret', {
      secretObjectValue: {
        Username: SecretValue.unsafePlainText(execUser.userName),
        AccessKeyId: SecretValue.unsafePlainText(accessKey.accessKeyId),
        SecretAccessKey: accessKey.secretAccessKey
      },
    });
    secret.node.addDependency(accessKey)
  }
}
