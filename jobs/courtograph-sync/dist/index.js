"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const node_crypto_1 = require("node:crypto");
const csv = require("csvtojson");
const node_fs_1 = require("node:fs");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const client_s3_1 = require("@aws-sdk/client-s3");
const client_secrets_manager_1 = require("@aws-sdk/client-secrets-manager");
const client_lambda_1 = require("@aws-sdk/client-lambda");
const processSeason_1 = require("./helpers/processSeason");
const DRIVE_FOLDER_ID = requiredEnv("DRIVE_FOLDER_ID");
const DRIVE_OAUTH_SECRET_ARN = requiredEnv("DRIVE_OAUTH_SECRET_ARN");
const TABLE_NAME = requiredEnv("COURTOGRAPH_TABLE_NAME");
const ARCHIVE_BUCKET = requiredEnv("SYNC_ARCHIVE_BUCKET");
const WRITE_UNITS_PER_SECOND = positiveNumber(process.env.WRITE_UNITS_PER_SECOND, 700);
const SEASON_FOLDER_PATTERN = /^\d{4}-\d{4}(?:_|$)/;
const GAME_FILENAME_PATTERN = /^\[\d{4}-\d{2}-\d{2}\].*?[A-Z]{3}@[A-Z]{3}\.csv$/i;
const MAX_BATCH_RETRIES = 10;
const MIN_REMAINING_MS = 90_000;
const db = lib_dynamodb_1.DynamoDBDocumentClient.from(new client_dynamodb_1.DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
});
const s3 = new client_s3_1.S3Client({});
const secrets = new client_secrets_manager_1.SecretsManagerClient({});
const lambda = new client_lambda_1.LambdaClient({});
class YieldRun extends Error {
}
function checkTime(context) {
    if (context.getRemainingTimeInMillis() < MIN_REMAINING_MS)
        throw new YieldRun();
}
function fingerprint(value) {
    return (0, node_crypto_1.createHash)("sha256").update(JSON.stringify(value)).digest("hex");
}
function requiredEnv(name) {
    const value = process.env[name];
    if (!value)
        throw new Error(`Missing required environment variable ${name}`);
    return value;
}
function positiveNumber(value, fallback) {
    const parsed = value === undefined ? fallback : Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0)
        throw new Error("WRITE_UNITS_PER_SECOND must be positive");
    return parsed;
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
async function secretValue() {
    const result = await secrets.send(new client_secrets_manager_1.GetSecretValueCommand({ SecretId: DRIVE_OAUTH_SECRET_ARN }));
    if (!result.SecretString)
        throw new Error("Drive OAuth secret has no SecretString");
    const parsed = JSON.parse(result.SecretString);
    const oauth = parsed.installed ?? parsed.web ?? parsed;
    if (!oauth.client_id || !oauth.client_secret || !parsed.refresh_token) {
        throw new Error("Drive OAuth secret must contain client_id, client_secret, and refresh_token");
    }
    return {
        client_id: oauth.client_id,
        client_secret: oauth.client_secret,
        refresh_token: parsed.refresh_token,
        token_uri: parsed.token_uri ?? oauth.token_uri,
    };
}
async function accessToken() {
    const credentials = await secretValue();
    const response = await fetch(credentials.token_uri ?? "https://oauth2.googleapis.com/token", {
        method: "POST",
        signal: AbortSignal.timeout(30_000),
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: credentials.client_id,
            client_secret: credentials.client_secret,
            refresh_token: credentials.refresh_token,
            grant_type: "refresh_token",
        }),
    });
    if (!response.ok)
        throw new Error(`Google OAuth token refresh failed (${response.status}): ${await response.text()}`);
    const body = await response.json();
    if (!body.access_token)
        throw new Error("Google OAuth response did not include an access token");
    return body.access_token;
}
async function driveJson(token, url) {
    const response = await fetch(url, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) });
    if (!response.ok)
        throw new Error(`Google Drive request failed (${response.status}): ${await response.text()}`);
    return response.json();
}
async function listChildren(token, parentId) {
    const all = [];
    let pageToken;
    do {
        const params = new URLSearchParams({
            q: `'${parentId.replace(/'/g, "\\'")}' in parents and trashed = false`,
            pageSize: "1000",
            orderBy: "name",
            fields: "nextPageToken,files(id,name,mimeType,modifiedTime,md5Checksum)",
            supportsAllDrives: "true",
            includeItemsFromAllDrives: "true",
        });
        if (pageToken)
            params.set("pageToken", pageToken);
        const page = await driveJson(token, `https://www.googleapis.com/drive/v3/files?${params.toString()}`);
        all.push(...(page.files ?? []));
        pageToken = page.nextPageToken;
    } while (pageToken);
    return all;
}
async function listSeasonFiles(token, folder) {
    const pending = [folder.id];
    const files = [];
    while (pending.length) {
        const children = await listChildren(token, pending.pop());
        for (const child of children) {
            if (child.mimeType === "application/vnd.google-apps.folder")
                pending.push(child.id);
            else if (GAME_FILENAME_PATTERN.test(child.name))
                files.push(child);
            else
                console.info(JSON.stringify({ event: "ignored-file", name: child.name }));
        }
    }
    return files.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}
async function listSeasonFolders(token) {
    const children = await listChildren(token, DRIVE_FOLDER_ID);
    return children.filter(file => file.mimeType === "application/vnd.google-apps.folder" && SEASON_FOLDER_PATTERN.test(file.name));
}
function seasonStateKey(folderId) {
    return `state/seasons/${folderId}.json`;
}
async function getObjectBytes(key) {
    try {
        const result = await s3.send(new client_s3_1.GetObjectCommand({ Bucket: ARCHIVE_BUCKET, Key: key }));
        if (!result.Body)
            return undefined;
        return await result.Body.transformToByteArray();
    }
    catch (error) {
        const responseError = error;
        if (responseError.name === "NoSuchKey" || responseError.$metadata?.httpStatusCode === 404)
            return undefined;
        throw error;
    }
}
async function readJsonObject(key) {
    const bytes = await getObjectBytes(key);
    return bytes ? JSON.parse(Buffer.from(bytes).toString("utf8")) : undefined;
}
async function putJsonObject(key, value) {
    await s3.send(new client_s3_1.PutObjectCommand({
        Bucket: ARCHIVE_BUCKET,
        Key: key,
        Body: JSON.stringify(value),
        ContentType: "application/json",
    }));
}
async function downloadDriveFile(token, file) {
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`, {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok)
        throw new Error(`Drive download failed for ${file.name} (${response.status}): ${await response.text()}`);
    return new Uint8Array(await response.arrayBuffer());
}
function fileChanged(file, previous) {
    if (!previous)
        return true;
    if (file.name !== previous.name)
        return true;
    if (file.md5Checksum && previous.md5Checksum)
        return file.md5Checksum !== previous.md5Checksum;
    return file.modifiedTime !== previous.modifiedTime || file.name !== previous.name;
}
async function writeBatch(requests, context) {
    for (let offset = 0; offset < requests.length; offset += 25) {
        let unprocessed = requests.slice(offset, offset + 25);
        let attempt = 0;
        while (unprocessed.length) {
            const estimatedUnits = unprocessed.reduce((sum, request) => {
                const item = request.PutRequest.Item;
                return sum + Math.max(1, Math.ceil(Buffer.byteLength(JSON.stringify(item), "utf8") / 1024));
            }, 0);
            const sentAt = Date.now();
            try {
                const result = await db.send(new lib_dynamodb_1.BatchWriteCommand({
                    RequestItems: { [TABLE_NAME]: unprocessed }, ReturnConsumedCapacity: "TOTAL",
                }));
                const next = result.UnprocessedItems?.[TABLE_NAME];
                unprocessed = next ?? [];
                const consumed = (result.ConsumedCapacity ?? []).reduce((sum, capacity) => sum + (capacity.CapacityUnits ?? 0), 0);
                const units = Math.max(estimatedUnits, consumed);
                const wait = Math.ceil(units / WRITE_UNITS_PER_SECOND * 1000) - (Date.now() - sentAt);
                if (wait > 0)
                    await sleep(wait);
            }
            catch (error) {
                const name = error.name;
                if (!name || !["ThrottlingException", "ProvisionedThroughputExceededException", "RequestLimitExceeded"].includes(name))
                    throw error;
            }
            if (!unprocessed.length)
                break;
            attempt++;
            if (attempt >= MAX_BATCH_RETRIES || context.getRemainingTimeInMillis() < 30_000) {
                throw new Error(`DynamoDB still has ${unprocessed.length} unprocessed writes after ${attempt} attempts`);
            }
            const backoff = Math.min(30_000, 1000 * 2 ** attempt);
            await sleep(backoff / 2 + Math.random() * backoff / 2);
        }
    }
}
function rowKey(row) {
    return JSON.stringify([row.PK, row.SK]);
}
function assertUniqueKeys(rows, description) {
    const seen = new Set();
    for (const item of rows) {
        if (!item || typeof item !== "object") {
            throw new Error(`Processed output has an invalid DynamoDB row in ${description}`);
        }
        const row = item;
        if (typeof row.PK !== "string" || typeof row.SK !== "string") {
            throw new Error(`Processed output has an invalid DynamoDB key in ${description}`);
        }
        JSON.stringify(row, (_key, value) => {
            if (typeof value === "number" && !Number.isFinite(value))
                throw new Error(`Non-finite number in ${description}`);
            return value;
        });
        const key = rowKey(row);
        if (seen.has(key))
            throw new Error(`Processed output contains duplicate PK/SK ${key}`);
        seen.add(key);
    }
}
function changedRows(rows, previous) {
    const old = new Map(previous.map(row => [rowKey(row), fingerprint(row)]));
    return rows.filter(row => old.get(rowKey(row)) !== fingerprint(row));
}
async function persistRegistry(registryPath) {
    await s3.send(new client_s3_1.PutObjectCommand({ Bucket: ARCHIVE_BUCKET, Key: "state/player_ids.json",
        Body: (0, node_fs_1.readFileSync)(registryPath), ContentType: "application/json" }));
}
async function prepareGame(token, folder, file, manifest, registryPath) {
    const bytes = await downloadDriveFile(token, file);
    const workDir = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)((0, node_os_1.tmpdir)(), "courtograph-game-"));
    let output;
    try {
        // Default csvtojson conversion preserves the string values used by the reference processor.
        const items = await csv({ checkColumn: true }).fromString(Buffer.from(bytes).toString("utf8"));
        if (!items.length)
            throw new Error("CSV has no play rows");
        for (const item of items) {
            if (!item || typeof item !== "object" ||
                ["event_type", "period", "play_id", "home_score", "away_score"].some(key => typeof item[key] !== "string" || !item[key])) {
                throw new Error("CSV is missing required play fields");
            }
        }
        const localPath = (0, node_path_1.join)(workDir, (0, node_path_1.basename)(file.name).replace(/\.csv$/i, ".json"));
        (0, node_fs_1.writeFileSync)(localPath, JSON.stringify(items));
        const rows = await (0, processSeason_1.processFolder)([localPath], folder.name, (0, node_path_1.join)(workDir, "output.json"), registryPath);
        assertUniqueKeys(rows, file.name);
        const metadata = rows.find(row => row.SK === "METADATA");
        if (!metadata)
            throw new Error("Game has no metadata");
        if (Object.values(manifest.files).some(prior => prior.id !== file.id && prior.gameKey === metadata.PK)) {
            throw new Error("Another source file already owns this game; resolve the duplicate before retrying");
        }
        output = { rows: rows.filter(row => !row.SK.includes("SEASON#")),
            summary: rows.filter(row => row.SK.includes("SEASON#")) };
    }
    catch (error) {
        console.error(JSON.stringify({ event: "invalid-game", season: folder.name, file: file.name,
            error: error instanceof Error ? error.message : String(error) }));
        return undefined;
    }
    finally {
        (0, node_fs_1.rmSync)(workDir, { recursive: true, force: true });
    }
    // Persist assigned IDs before any game rows or durable pending work can reference them.
    await persistRegistry(registryPath);
    const revision = fingerprint([folder.name, file.name, (0, node_crypto_1.createHash)("sha256").update(bytes).digest("hex")]);
    const prefix = `games/${folder.id}/${file.id}/${revision}`;
    await s3.send(new client_s3_1.PutObjectCommand({ Bucket: ARCHIVE_BUCKET, Key: `${prefix}/source.csv`,
        Body: bytes, ContentType: "text/csv" }));
    await putJsonObject(`${prefix}/output.json`, output);
    await putJsonObject(`${prefix}/summary.json`, output.summary);
    const prior = manifest.files[file.id];
    const old = prior?.outputKey ? await readJsonObject(prior.outputKey) : undefined;
    const writes = changedRows(output.rows, old?.rows ?? []);
    await putJsonObject(`${prefix}/writes.json`, writes);
    return { file: { gameKey: output.rows.find(row => row.SK === "METADATA").PK, id: file.id, name: file.name, modifiedTime: file.modifiedTime, md5Checksum: file.md5Checksum,
            outputKey: `${prefix}/output.json`, summaryKey: `${prefix}/summary.json` },
        rowsKey: `${prefix}/writes.json`, rowCount: writes.length, offset: 0 };
}
async function finishGame(pending, key, manifest, context) {
    const rows = await readJsonObject(pending.rowsKey);
    if (!rows)
        throw new Error(`Missing pending game output: ${pending.file.name}`);
    while (pending.offset < rows.length) {
        checkTime(context);
        const batch = rows.slice(pending.offset, pending.offset + 250);
        await writeBatch(batch.map(Item => ({ PutRequest: { Item } })), context);
        pending.offset += batch.length;
        await putJsonObject(key, pending);
    }
    manifest.files[pending.file.id] = pending.file;
    await putJsonObject(seasonStateKey(manifest.seasonFolderId), manifest);
    // A null checkpoint clears pending work without deleting an archive object.
    await putJsonObject(key, null);
    console.info(JSON.stringify({ event: "game-complete", file: pending.file.name, rowsWritten: pending.rowCount }));
}
function addContribution(target, rows) {
    for (const row of rows) {
        const key = rowKey(row);
        const existing = target[key];
        if (!existing) {
            target[key] = { ...row };
            continue;
        }
        // These rows contain additive counts/minutes, fixed metadata, and playoff flags.
        for (const [field, value] of Object.entries(row)) {
            if (typeof value === "number" && field !== "seed")
                existing[field] = existing[field] + value;
            else if (typeof value === "boolean")
                existing[field] = Boolean(existing[field]) || value;
        }
    }
}
async function publishTotals(manifest, context) {
    const games = Object.values(manifest.files).sort((a, b) => a.id.localeCompare(b.id));
    const revision = fingerprint(games.map(game => game.summaryKey));
    if (manifest.publishedRevision === revision)
        return;
    const key = `state/aggregates/${manifest.seasonFolderId}.json`;
    let progress = await readJsonObject(key);
    if (!progress || progress.revision !== revision) {
        progress = { revision, offset: 0, rows: {}, writeOffset: 0 };
    }
    while (progress.offset < games.length) {
        checkTime(context);
        const game = games[progress.offset];
        const summary = await readJsonObject(game.summaryKey);
        if (!summary)
            throw new Error(`Missing game summary: ${game.name}`);
        addContribution(progress.rows, summary);
        progress.offset++;
        if (progress.offset % 50 === 0 || context.getRemainingTimeInMillis() < MIN_REMAINING_MS) {
            await putJsonObject(key, progress);
        }
    }
    const outputKey = `aggregates/${manifest.seasonFolderId}.json`;
    if (!progress.writes) {
        const previous = await readJsonObject(outputKey) ?? [];
        progress.writes = changedRows(Object.values(progress.rows), previous);
        await putJsonObject(key, progress);
    }
    while (progress.writeOffset < progress.writes.length) {
        checkTime(context);
        const batch = progress.writes.slice(progress.writeOffset, progress.writeOffset + 250);
        await writeBatch(batch.map(Item => ({ PutRequest: { Item } })), context);
        progress.writeOffset += batch.length;
        await putJsonObject(key, progress);
    }
    await putJsonObject(outputKey, Object.values(progress.rows));
    manifest.publishedRevision = revision;
    await putJsonObject(seasonStateKey(manifest.seasonFolderId), manifest);
}
async function processSeason(token, folder, files, oldManifest, registryPath, context) {
    const manifest = oldManifest ?? { seasonFolderId: folder.id, seasonFolderName: folder.name, files: {} };
    if (manifest.seasonFolderName.split("_")[0] !== folder.name.split("_")[0])
        throw new Error(`Season folder was renamed from ${manifest.seasonFolderName} to ${folder.name}; restore its name before syncing`);
    if (Object.values(manifest.files).some(file => !file.summaryKey))
        throw new Error("Legacy season checkpoints need migration before game-level sync");
    manifest.seasonFolderName = folder.name;
    const pendingKey = `state/pending/${folder.id}.json`;
    const pending = await readJsonObject(pendingKey);
    if (pending)
        await finishGame(pending, pendingKey, manifest, context);
    let failed = false;
    for (const file of files) {
        if (!fileChanged(file, manifest.files[file.id]) && manifest.files[file.id]?.summaryKey)
            continue;
        checkTime(context);
        const game = await prepareGame(token, folder, file, manifest, registryPath);
        if (!game) {
            failed = true;
            continue;
        }
        await putJsonObject(pendingKey, game);
        await finishGame(game, pendingKey, manifest, context);
    }
    // Missing source files remain in the manifest. Failed CSVs prevent publishing incomplete totals.
    if (!failed)
        await publishTotals(manifest, context);
    return !failed;
}
async function continueLater(context) {
    await lambda.send(new client_lambda_1.InvokeCommand({
        FunctionName: context.functionName,
        InvocationType: "Event",
        Payload: Buffer.from(JSON.stringify({ continuation: true })),
    }));
}
async function handler(_event, context) {
    const token = await accessToken();
    const folders = await listSeasonFolders(token);
    if (!folders.length)
        throw new Error("No expected season folders found in the Drive root");
    const registryPath = (0, node_path_1.join)((0, node_os_1.tmpdir)(), `courtograph-player-ids-${context.awsRequestId}.json`);
    const savedRegistry = await getObjectBytes("state/player_ids.json");
    if (!savedRegistry)
        throw new Error("Upload the initial player registry to state/player_ids.json before syncing");
    (0, node_fs_1.writeFileSync)(registryPath, savedRegistry);
    let failed = false;
    try {
        for (const folder of folders) {
            if (context.getRemainingTimeInMillis() < MIN_REMAINING_MS) {
                await continueLater(context);
                return;
            }
            const files = await listSeasonFiles(token, folder);
            const manifest = await readJsonObject(seasonStateKey(folder.id));
            if (!files.length && !manifest) {
                console.error(JSON.stringify({ event: "empty-season", season: folder.name }));
                failed = true;
                continue;
            }
            if (!await processSeason(token, folder, files, manifest, registryPath, context))
                failed = true;
        }
        if (failed)
            throw new Error("Some games could not be processed; see invalid-game/empty-season logs. Their season totals were not published.");
    }
    catch (error) {
        if (!(error instanceof YieldRun))
            throw error;
        await continueLater(context);
    }
    finally {
        (0, node_fs_1.rmSync)(registryPath, { force: true });
    }
}
