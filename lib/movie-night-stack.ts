import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';

export class MovieNightStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const table = new dynamodb.TableV2(this, 'MovieNightTable', {
      tableName: 'movie-night-table',
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
      },
      globalSecondaryIndexes: [
        {
          indexName: 'GSI1',
          partitionKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
          sortKey: { name: 'GSI_SK', type: dynamodb.AttributeType.STRING },
        },
      ]
    });

    const execUser = new iam.User(this, 'MovieNightUser', {
      userName: 'movie-night-exec-user'
    })
    execUser.attachInlinePolicy(new iam.Policy(this, 'MovieNightExecPolicy', {
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
          resources: [table.tableArn]
        })
      ]
    }))
    execUser.node.addDependency(table)
  }
}
