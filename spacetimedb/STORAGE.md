# Spaces and private PDF storage

The backend uses SpacetimeDB for authoritative metadata and S3 for PDF bytes,
following planning document 02 and the official
[SpacetimeDB S3 workflow](https://spacetimedb.com/docs/how-to/app-patterns/store-files-in-s3/).
S3 signing and verification run directly inside database procedures. The Node
Bedrock agent service does not need to run for PDF uploads.

## AWS setup

1. In the AWS S3 console, create a **general purpose bucket** in `us-east-1`.
   Choose a unique name with lowercase letters, digits and hyphens, without dots.
   Keep **Block all public access** enabled, **Bucket owner enforced** ownership,
   and default **SSE-S3** encryption. Versioning may remain disabled for the demo;
   if enabled, confirmed documents also retain their S3 version ID.
   [AWS bucket instructions](https://docs.aws.amazon.com/AmazonS3/latest/userguide/create-bucket-overview.html).
2. Open the bucket's **Permissions → Cross-origin resource sharing (CORS) → Edit**.
   Paste [config/s3-cors.json](config/s3-cors.json). Add the exact frontend origin
   if using a different port or deployed site. Keep the bucket private.
   [AWS CORS instructions](https://docs.aws.amazon.com/AmazonS3/latest/userguide/enabling-cors-examples.html).
3. In **IAM → Policies → Create policy → JSON**, paste
   [config/s3-iam-policy.json](config/s3-iam-policy.json), replace `YOUR_BUCKET_NAME`,
   and save as `HackUTDSpacePdfStorage`. This permits object operations only
   under `hackutd2026/` in your bucket.
   [AWS policy instructions](https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_create-console.html).
4. In **IAM → Users**, create a dedicated application user (no console login
   needed) and attach that policy. Open the user's **Security credentials →
   Access keys → Create access key**, select the applicable outside-AWS use case,
   and save the access key ID and secret access key. The secret is displayed only
   when created. Use an IAM user, not root credentials.
   [AWS access-key instructions](https://docs.aws.amazon.com/IAM/latest/UserGuide/access-key-self-managed.html).
   If using temporary lab/STS credentials instead, include the session token and
   republish when credentials rotate. AWS recommends temporary credentials where
   practical; this database signer consumes explicit keys and does not load an
   AWS profile or automatically refresh role credentials.

## Configure and run

Install dependencies from the repository root:

```powershell
pnpm install
```

Edit the existing ignored `spacetimedb/.env` (use `.env.example` as a reference;
do not overwrite existing Bedrock configuration):

```dotenv
S3_BUCKET=your-private-pdf-bucket
S3_REGION=us-east-1
S3_PREFIX=hackutd2026
S3_ACCESS_KEY_ID=your-iam-access-key-id
S3_SECRET_ACCESS_KEY=your-iam-secret-access-key
# Only for temporary credentials:
# S3_SESSION_TOKEN=your-session-token
```

S3 credentials can belong to the same IAM principal as your Bedrock credentials
if that principal has the S3 policy. They still need to be set under these `S3_`
names. Do not prefix them with `VITE_` or put them in browser code.

Start the database in one terminal:

```powershell
pnpm start:spacetime
```

In another terminal, from the repository root:

```powershell
pnpm publish:spacetime
pnpm generate:spacetime
pnpm dev:web
```

The normal `publish:spacetime` command loads `spacetimedb/.env` into the publishing
process, and the CLI publishes declared variables to the database. No separate
credential script or credential-publishing step is needed. `publish:storage`
remains an alias for backward compatibility. The default database is `hackutd2026` on
the local server; set `SPACETIMEDB_DB_NAME` / `SPACETIMEDB_SERVER` for another one.
No data reset is requested. Use Node 24+ for the helper scripts.

## Backend contract and frontend integration

Log in using the existing signup/login flow first. Owner identity is the user's
stable `users.username` key, resolved through the caller's session; clients
cannot choose another owner's key. Reconnecting or logging in from another
device retains ownership. Company memberships and sharing are future work.

| Record | Purpose |
| --- | --- |
| `spaces` | ID, owner user key, name, description, archive flag, timestamps |
| `documents` | Space ID, uploader, original filename, MIME, size, SHA-256, category, visibility, bucket/region/key/version, verification and processing metadata |
| `uploads` | One upload per document, attempt count, status, signed URL expiry |
| `document_artifacts` | Future parsed text, thumbnails and extraction JSON in separate S3 objects, linked to the source document and extraction version |

All four tables are private. Subscribe to `my_spaces` and `my_documents` for
owner-filtered live metadata; S3 locations and credentials are not in the views.
The library includes archived spaces and failed/pending documents, so the UI can
show their states. Accounts owning spaces cannot currently be deleted, avoiding
orphaning their documents or transferring ownership through username reuse.

```typescript
await connection.reducers.createSpace({
  name: "Dallas Data Center",
  description: "HVAC inspection documents",
});
connection.subscriptionBuilder().subscribe([
  "SELECT * FROM my_spaces",
  "SELECT * FROM my_documents",
]);
```

Select the space ID from `connection.db.mySpaces.iter()`. For each `File` dropped
into that space, call the provided browser helper:

```typescript
import { uploadSpacePdf } from "./lib/documents"; // adjust relative path

await uploadSpacePdf(connection, spaceId, file, "inspection");
```

The helper computes SHA-256, calls `requestDocumentUpload`, PUTs the file directly
to S3, then calls `confirmDocumentUpload`. The backend accepts only `.pdf` /
`application/pdf`, 5 bytes–20 MiB, and binds the signed URL to the exact size,
MIME, and checksum. Browsers set Content-Length automatically. Do not add an
application authorization header to the S3 PUT. The create-space modal on `/spaces`
uses this helper for its drop zone. It previews the selected PDF locally and
shows selectable cards for all attached files before upload.
It calls `createSpaceWithId` to create the
space and obtain its ID, then uploads and confirms each selected PDF. On partial
failure, the page retains the space/document IDs so retries do not create
duplicate records. Successful creation closes the modal and updates the spaces grid.

Request a private preview/download URL:

```typescript
const url = await connection.procedures.requestDocumentDownload({ documentId });
window.open(url, "_blank", "noopener,noreferrer");
```

Links expire after five minutes. URLs are bearer credentials while valid and
should not be persisted or logged. Downloads are unavailable until confirmation.
Confirmation checks size, MIME, S3's SHA-256 checksum and the `%PDF-` header. This
is basic file validation, not a full PDF parser or malware scan.

Other operations:

- `updateSpace({ spaceId, name, description })`.
- `setSpaceArchived({ spaceId, archived })`: blocks new uploads while archived;
  existing verified PDFs remain downloadable by their owner.
- `retryDocumentUpload({ documentId })`: refreshes the upload ticket for the
  original file; `retrySpacePdf` in the browser helper uploads it and confirms.
- `cancelDocumentUpload({ documentId })`: records a failed/cancelled upload;
  already issued S3 URLs remain valid until expiry.
- `cleanupDocumentUpload({ documentId })`: deletes an unverified abandoned object
  and its metadata after 15 minutes (URL expiry plus transfer grace). Cleanup is
  owner-triggered, not an automatic scheduled job. If bucket versioning is on,
  DELETE adds a marker; configure retention for abandoned noncurrent versions
  separately without expiring verified document versions.

Upload states are `requested → uploaded → verified`, with `failed` and `deleting`
for recovery/cleanup. `uploaded` means the client requested confirmation; the
object is not trusted until verified. Retries increment an attempt counter so
stale verification cannot overwrite a new attempt. `extractionVersion = 0`
means no AI extraction has run. Derived artifacts have no public mutation API;
future AI code should operate only on verified source documents.

Troubleshooting: S3 `403` usually means wrong keys, region, missing policy,
expired temporary credentials, or a bucket/prefix mismatch. A browser-only
failure usually means the CORS origin/headers differ. Verification failure can
mean no uploaded object, different size/checksum/MIME, or a missing PDF header.
Use the configured SSE-S3 encryption for this policy; SSE-KMS additionally
requires permissions on the KMS key for upload and checksum verification.
