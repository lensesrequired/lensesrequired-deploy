# Infrastructure conventions

- Use strict TypeScript and AWS CDK v2 with the installed versions in `package.json`. Keep application stacks in `lib/` and register them in `bin/lensesrequired-deploy.ts`.
- Before adding resources, inspect the existing Courtograph, Movie Night and Journal stacks and follow their naming and setup patterns.
- Prefix owned construct IDs with the application name in PascalCase, for example `FivefoldTable`, `FivefoldUser`, `FivefoldExecPolicy`, `FivefoldExecUserAccessKey` and `FivefoldAccessKeySecret`. Apply the prefix to ancillary resources too: archives, jobs, schedules, roles, logs, queues, topics and alarms.
- Give DynamoDB tables explicit lowercase hyphenated physical names that agree with application configuration. Fivefold uses `fivefold-game`; Courtograph uses the existing `courtograph-table-v2`. Execution users follow `<application>-exec-user` (for example `fivefold-exec-user`).
- Other resources may use CDK-generated physical names based on their application-prefixed construct IDs, as the existing secrets do. Do not introduce fixed physical names unnecessarily. Keep CloudFormation output keys stable and avoid construct/output ID collisions.
- For application access keys, follow the existing IAM user + `iam.AccessKey` + Secrets Manager pattern. Store `Username`, `AccessKeyId` and `SecretAccessKey` in the application-prefixed access key secret. Use CDK secret references; never hardcode or commit credentials or expose key values in outputs.
- Scope permissions to the application’s resources and required item operations. Fivefold needs read/write and conditional transaction operations on its game table, and read-only access to the reused Courtograph table and indexes. Avoid scans, table administration and unrelated resource access.
- Reuse Courtograph’s canonical NBA table rather than provisioning another NBA data table. Background ingestion may receive its own scoped write permissions.
- Manage Fivefold `SESSION_SECRET` through local `.env` and Vercel settings. Do not provision a session secret or speculative source credentials secret in this stack.
- Protect persistent data with on-demand DynamoDB billing, PITR, deletion protection and retention policies, following existing stacks. Preserve private, encrypted, versioned source archives where needed.
- Treat changes to construct IDs or physical names as deployment changes: they can replace resources. Review and document retention, name conflicts and data migration implications. Never assume a table rename migrates data.
- Keep infrastructure documentation, application environment variable names and stack outputs consistent. Supply real job artifacts and explicit schedules; do not deploy placeholder handlers or invent unresolved product timing rules.
- Colocate new tests in `__tests__`. For code changes run `npm run typecheck` and `npm test -- --runInBand`; verify synthesized resource names, IAM scope and data protection when those behaviors change.
- Deploy only the intended stack (`cdk deploy <StackName> --exclusively`) and review its diff first. Do not deploy, commit unrelated changes or include local files such as `.DS_Store` without authorization.
