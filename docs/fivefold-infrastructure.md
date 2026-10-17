# Fivefold / NBA Rivals infrastructure

Implements the AWS foundation in `fivefold/docs/nba-rivals-specification.md` (16 October 2026), using the existing CDK app. No existing application stacks are changed. The application currently calls its table `FIVEFOLD_TABLE`; its PK/SK query patterns need no GSI. Week discovery and scheduling remain application contracts: job handlers must query a maintained due-work partition (with pagination), or receive targeted work. Do not scan the table.

## Foundation deployment

```sh
npm ci
npm run typecheck
npm test -- --runInBand
npx cdk synth FivefoldStack
npx cdk diff FivefoldStack
npx cdk deploy FivefoldStack --exclusively
```

Use the intended AWS account/region and bootstrap it with CDK before first deployment. This stack imports `courtograph-table-v2` by name without changing it; set CDK context `courtographTableName` to override. Verify the actual deployed key schema and authorization before enabling integration. The game table uses on-demand billing, PITR, deletion protection, retained data and optional TTL (`ttl`, epoch seconds). The private S3 source archive is encrypted, versioned, TLS-only and retained; no automatic expiry is imposed on replay data.

Stack outputs:

| Output | Use |
| --- | --- |
| FivefoldTable | Set application `FIVEFOLD_TABLE` |
| AwsRegion | Set application `AWS_REGION` |
| CourtographTable | Set job `COURTOGRAPH_TABLE` |
| ApplicationPolicyArn | Attach to a dedicated existing host identity |
| ApplicationRoleArn | Optional role, created with `applicationPrincipalArn` context |
| SessionSecretArn | Host retrieves secret value into server-only `SESSION_SECRET` |
| SourceCredentialsSecretArn | Populate JSON with unattended source credentials out of band |
| RawArchiveBucket | Versioned ingestion archive |
| JobFailuresQueueUrl | Failed scheduler deliveries and Lambda asynchronous failures |
| OperationalAlertsTopicArn | Subscribe operators to error/throttle/backlog alerts |
| *FunctionArn | Emitted for each configured job |

The current application does not load Secrets Manager itself: its hosting configuration must inject the session secret value, not its ARN. No AWS access keys are generated. The application policy permits game item reads/writes and conditional transaction operations, canonical NBA reads, and session-secret retrieval. It forbids scans and table administration. Attach it only to a dedicated application identity; alternatively set `applicationPrincipalArn` to the existing IAM host role authorized to assume the generated role and configure the host's assume-role permission/credential provider. Hosting itself is not defined by the spec.

## Real job bundles and schedules

The foundation is deployable without jobs. Job code belongs to the application/Courtograph repositories and is not yet supplied here. Provide compiled, self-contained Node.js 22 directories containing `index.js` exporting `handler`, including runtime dependencies. Context `fivefoldJobs` is a JSON object keyed by `openWeek`, `lockWeek`, `recalculateScores`, `finalizeWeek`, and/or `ingest`. Each entry requires:

```json
{
  "assetPath": "/absolute/path/to/compiled-job",
  "scheduleExpression": "rate(5 minutes)",
  "timeZone": "America/Denver",
  "enabled": false
}
```

The rate above is an illustration, not an agreed product deadline. Supply the object through a local CDK context file or `-c 'fivefoldJobs={...}'`. Initially deploy disabled, inspect the synthesized IAM and manually invoke against test data, then explicitly enable. The stack does not guess the source publication timezone, selection deadline, finalization grace period or automatic week-opening policy. Scheduler cron timezone supports DST; handlers must calculate contest boundaries in America/Denver and enforce per-league UTC deadlines independently of scheduler execution.

Each invocation receives `{ "job": "lockWeek", "scheduledTime": "..." }` (with its job name). Four game jobs receive game-table item access and Courtograph read access. Ingestion receives canonical table item access, archive read/write and source-secret retrieval, without game-table write access. Ingestion must fail clearly until valid source credentials exist; the generated secret's `configured:false` marker is not a usable credential. Source licensing and unattended Drive access must be verified separately.

Handlers must be idempotent and conditional: duplicate invocation and concurrent application writes remain possible despite per-function concurrency of one. Freeze entrants/queues at lock, use transactions/state versions, preserve failure metadata, archive file revision/checksum, and rebuild corrected aggregates. Scoring must query changed data on subsequent runs; ingestion does not directly invoke scoring. Implement durable player IDs, checkpoints, due-work discovery and reconciliation in their owning repositories. Never mark a job successful before all writes complete.

Scheduler retries failed delivery three times within one hour; Lambda retries failed asynchronous executions twice within six hours. Both failure paths end in the retained-for-14-days SQS queue. Inspect the message format (Scheduler delivery vs. Lambda destination envelope), fix the cause, and replay the original payload idempotently. Logs retain 30 days. Subscribe an operator to SNS before enabling jobs. Infrastructure alarms cover execution failures, throttles and DLQ backlog; missed ingestion, stale canonical data, partial writes and failed reconciliation require domain metrics from the real handlers and are not claimed as implemented by these alarms.

## CI/CD

GitHub Actions runs typecheck, tests and offline foundation synthesis on PRs/pushes. Deployment is manual (`workflow_dispatch`, deploy=true), gated by a GitHub `fivefold` environment, with AWS OIDC and no stored access keys. Configure environment variables `FIVEFOLD_DEPLOY_ROLE_ARN` and `AWS_REGION`, environment reviewers, and an existing deployment role whose OIDC trust restricts the repository and `environment:fivefold`. Bootstrap permissions are managed outside this stack. The workflow deploys only FivefoldStack.

The workflow currently deploys the foundation only. Before enabling job deployment, add reproducible artifact acquisition/build and the reviewed `fivefoldJobs` context to both synth and deploy steps. Do not use this foundation-only workflow against a stack with locally configured jobs: missing context would remove those job resources. Review `cdk diff` with the exact context before each change. No deployment has been performed as part of writing this code.
