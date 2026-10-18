/**
 * The Node.js 22 Lambda runtime includes AWS SDK for JavaScript v3.
 * These small declarations let the deployment package compile without
 * vendoring SDK packages into the Lambda asset.
 */
declare module "@aws-sdk/client-dynamodb" {
  export class DynamoDBClient {
    constructor(configuration?: Record<string, unknown>);
  }
}

declare module "@aws-sdk/lib-dynamodb" {
  export class DynamoDBDocumentClient {
    static from(client: unknown, options?: Record<string, unknown>): DynamoDBDocumentClient;
    send<T extends object>(command: unknown): Promise<T>;
  }
  export class BatchWriteCommand {
    constructor(input: Record<string, unknown>);
  }
}

declare module "@aws-sdk/client-s3" {
  export class S3Client {
    constructor(configuration?: Record<string, unknown>);
    send<T extends object>(command: unknown): Promise<T>;
  }
  export class GetObjectCommand {
    constructor(input: Record<string, unknown>);
  }
  export class PutObjectCommand {
    constructor(input: Record<string, unknown>);
  }
  export class DeleteObjectCommand {
    constructor(input: Record<string, unknown>);
  }
}

declare module "@aws-sdk/client-secrets-manager" {
  export class SecretsManagerClient {
    constructor(configuration?: Record<string, unknown>);
    send<T extends object>(command: unknown): Promise<T>;
  }
  export class GetSecretValueCommand {
    constructor(input: Record<string, unknown>);
  }
}

declare module "@aws-sdk/client-lambda" {
  export class LambdaClient {
    constructor(configuration?: Record<string, unknown>);
    send<T extends object>(command: unknown): Promise<T>;
  }
  export class InvokeCommand {
    constructor(input: Record<string, unknown>);
  }
}
