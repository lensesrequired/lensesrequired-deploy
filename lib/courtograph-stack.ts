import * as cdk from 'aws-cdk-lib';
import {SecretValue} from 'aws-cdk-lib';
import {Construct} from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import {CapacityMode} from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

export class CourtographStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const table = new dynamodb.Table(this, 'CourtographGamesTable', {
      tableName: 'courtograph-games-table',
      billingMode: dynamodb.BillingMode.PROVISIONED,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      readCapacity: 10,
      writeCapacity: 5,

      deletionProtection: true,
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      }
    });

    table.addGlobalSecondaryIndex({
      indexName: 'PerSeasonIndex',
      partitionKey: { name: 'Season', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
      readCapacity: 5,
      writeCapacity: 5
    })

    table.addGlobalSecondaryIndex({
      indexName: 'GamesPerIndex',
      partitionKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'Game', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
      readCapacity: 5,
      writeCapacity: 5
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
  }
}
