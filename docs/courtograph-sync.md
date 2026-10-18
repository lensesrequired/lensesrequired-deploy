# Courtograph daily Drive sync

CourtographStack defines a daily sync from Drive folder `1AUlATK2q3pqF0JHgkl3gP1P0DRVu_6T3` into the existing `courtograph-table-v2`. The schedule remains disabled by default.

## Input and processing

- The root contains season folders named `YYYY-YYYY` or starting `YYYY-YYYY_`.
- Within those folders (including subfolders), the job accepts per-game CSV filenames like `[2025-10-21]-HOU@OKC.csv`. Unrelated files are logged and ignored. No season folders, or a new season without matching CSVs, causes a reported failure.
- CSV conversion uses the reference converter's `csvtojson` package and string-value behavior, with column-count checks. Converted JSON goes through the vendored Courtograph processor. Keep its helpers in sync with the reference scripts when processing rules change.
- A malformed game is logged individually and remains pending for retry. Other games and seasons continue. A season with a failed game does not publish new totals. The invocation ultimately fails so the existing error alarm/retry/DLQ path reports unresolved failures.
- Source CSVs and processed game outputs are archived in private, encrypted, versioned S3 storage. A game checkpoint is committed only after its writes finish. New player IDs are persisted before any database writes reference them.
- For a changed game, only rows different from its previous successful output are written. A new archive has no comparison baseline, so its first sync writes all source game rows once, even if those rows already exist in DynamoDB.
- Writes checkpoint every 250 rows. Continuations resume pending batches; an interrupted batch can be replayed safely using the same keys. Completed games are skipped. Continuation invocations are serialized by reserved concurrency of one. Intentional recursion is allowed because historical backfills can exceed 16 invocations.
- Season totals are rebuilt from compact per-game contributions, not all play rows. Aggregation checkpoints every 50 games; only changed aggregate rows are written. Aggregation and publication resume across invocations. Publication is a sequence of batch writes, not an atomic replacement of all season totals; readers can briefly see a mixture of old and new totals during publication or recovery.
- This job never deletes database rows or archive objects. Missing Drive files retain their archived contribution to totals. Filename corrections are detected even when the checksum is unchanged. If corrections change keys, old database records remain and require a separate deliberate migration. A second file for the same game is reported as a duplicate rather than double-counted. Changing the season years in a folder name requires restoring the original years before syncing; renaming its descriptive suffix is allowed.

## Player registry

The initial registry belongs at `s3://<CourtographSyncArchiveBucketName>/state/player_ids.json`. The source is `courtograph/scripts/data/player_ids.json`. The handler refuses to start if this seed is absent. The initial registry has been uploaded by the operator; do not overwrite it after ingestion begins.

The new game checkpoints are not compatible with checkpoints produced by the earlier whole-season implementation. Such a checkpoint causes an explicit migration error rather than publishing incomplete totals.

## OAuth secret

The stack creates a dedicated retained secret, `CourtographDriveOAuthCredentials`, and outputs its ARN as `CourtographDriveOAuthSecretArn`. This is separate from Fivefold's AWS access-key secret. Populate it with:

```json
{
  "client_id": "...",
  "client_secret": "...",
  "refresh_token": "..."
}
```

Standard OAuth client JSON with `installed` or `web` fields is also accepted, with `refresh_token` at the top level. The refresh token must belong to an account with access to the folder and the `https://www.googleapis.com/auth/drive.readonly` scope. The created secret starts with empty values; populate it before invoking the job. Never put credentials in CDK context or source control.

## Resources and cost

The Lambda uses Node.js 22, 2 GB memory, the included 512 MB temporary storage, a 15-minute timeout, and one concurrent invocation. Its memory holds one game's play rows plus compact season aggregates. At the same duration, 2 GB costs one fifth of the previous 10 GB setting; lower memory also means less CPU, so actual duration needs measuring. At US East x86 Lambda compute pricing, five minutes daily is approximately $0.30/month and fifteen minutes daily approximately $0.90/month, before free-tier credits. Multiple continuation invocations add their durations.

DynamoDB remains on-demand. The 1,000 write-unit limits are ceilings, not reserved capacity; the writer targets 700 units/second including reported consumption. Initial backfills, changed rows, index writes, storage, retained S3 versions, logs, and the OAuth secret are additional costs. A 1.5-million-row season is written once initially, not in full every day.

## Build and deploy

Use Node.js 22 or newer:

```sh
npm ci
npm run build:courtograph-sync
npx cdk synth CourtographStack
npx cdk diff CourtographStack
npx cdk deploy CourtographStack --exclusively
```

The build packages csvtojson and lodash into the Lambda artifact. AWS SDK v3 clients are supplied by the Node.js Lambda runtime; its minor SDK version is controlled by AWS. The source archive, OAuth secret, function, failure queue, and alert topic are exposed as stack outputs.

Populate the OAuth secret, preserve the uploaded player registry, subscribe to `CourtographSyncAlertsTopicArn`, and manually invoke `CourtographSyncFunctionArn`. Once the initial run and any continuations complete successfully, enable the daily schedule:

```sh
npx cdk diff CourtographStack -c courtographSyncEnabled=true
npx cdk deploy CourtographStack --exclusively -c courtographSyncEnabled=true
```

The schedule is every 24 hours relative to its start, with no chosen time of day. Override the Drive root using `-c courtographDriveFolderId=<id>` when needed. This code change does not deploy resources or enable the schedule.
