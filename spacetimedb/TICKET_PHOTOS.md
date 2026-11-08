# Ticket photos in S3

Photos taken from the Meta glasses or the phone while working a ticket are stored
in **S3**, never in SpacetimeDB. The phone uploads the image bytes directly to S3
with a short-lived signed URL; SpacetimeDB keeps only an authorized reference row
(`ticket_photos`: ticket, step, caption, size, checksum, bucket, key, status). S3
signing and verification run inside database procedures, exactly like PDF uploads
(see [STORAGE.md](STORAGE.md)).

Object keys:

```
<S3_PREFIX>/spaces/<spaceId>/tickets/<ticketId>/photos/<photoId>-<timestamp>.<jpg|png|webp|heic>
```

## Choose where photos go

### Option A: the existing PDF bucket (default, no setup)

If `S3_PHOTO_BUCKET` is not set, photos go into `S3_BUCKET` under the same
`S3_PREFIX`. The existing IAM policy ([config/s3-iam-policy.json](config/s3-iam-policy.json))
already allows `PutObject`/`GetObject` on `YOUR_BUCKET_NAME/hackutd2026/*`, which
covers the photo keys. **Nothing to do.**

### Option B: a dedicated photo bucket

Use a separate bucket if you want photos isolated from documents (different
retention, lifecycle rules, or access reviews).

1. **Create the bucket.** In the AWS S3 console, choose **Create bucket**:
   - Type: **General purpose**, region e.g. `us-east-1`.
   - Name: lowercase letters, digits and hyphens, **no dots** (for example
     `hackutd2026-ticket-photos-<yourname>`). Dotted names break the signed HTTPS URLs.
   - Keep **Block all public access** on, **Bucket owner enforced** ownership, and
     default **SSE-S3** encryption. Versioning is optional.
2. **Allow the app's IAM user to use it.** In **IAM → Policies → Create policy → JSON**,
   paste [config/s3-photo-iam-policy.json](config/s3-photo-iam-policy.json), replace
   `YOUR_PHOTO_BUCKET_NAME`, and save it as `HackUTDTicketPhotoStorage`. Attach it
   to the **same IAM user** whose keys are in `S3_ACCESS_KEY_ID` /
   `S3_SECRET_ACCESS_KEY`. (If you changed `S3_PREFIX`, change `hackutd2026/` in the
   policy to match.) Photos use the same credentials as PDFs; there are no new keys.
3. **CORS.** Not needed for the native phone app: CORS applies only to browsers.
   The web Tickets view shows photos with plain `<img>` tags on signed GET URLs,
   which also need no CORS. Add the [config/s3-cors.json](config/s3-cors.json)
   rules to this bucket only if a browser will ever upload photos directly.
4. **Configure.** In `spacetimedb/.env`:

   ```dotenv
   S3_PHOTO_BUCKET=hackutd2026-ticket-photos-yourname
   # Only if the photo bucket is in a different region than S3_BUCKET:
   S3_PHOTO_REGION=us-east-1
   ```

5. **Publish** so the database picks up the new variables (from the repo root):

   ```powershell
   pnpm publish:spacetime
   pnpm generate:spacetime
   ```

Each photo row records the bucket and region it was written to, so switching
buckets later never breaks existing photos.

## How a photo gets attached (what the phone app does)

1. Take the photo and compute its **SHA-256, base64-encoded** (not hex), plus its
   byte size and content type (`image/jpeg`, `image/png`, `image/webp` or `image/heic`, 15 MB max).
2. Call the procedure **`request_ticket_photo_upload`**:

   | Argument | Type | Notes |
   |---|---|---|
   | `ticketId` | u64 | |
   | `stepOrder` | u32 | `1..n` for a step, `0` for the ticket itself |
   | `contentType` | string | one of the four types above |
   | `sizeBytes` | u32 | exact byte length |
   | `checksumSha256` | string | base64 SHA-256 of the bytes |
   | `caption` | string | optional, up to 300 characters (`""` for none) |
   | `source` | string | `"glasses"` or `"phone"` |

   It returns `{ photoId, url, expiresAt, contentType, checksumSha256 }`. The URL
   expires after 5 minutes.
3. **PUT the raw bytes to `url`** with exactly these headers:

   ```
   Content-Type: <contentType>
   Content-Length: <sizeBytes>
   x-amz-checksum-sha256: <checksumSha256>
   ```

   S3 rejects the upload if the bytes don't match the checksum.
4. Call **`confirm_ticket_photo_upload(photoId)`**. The database HEADs the object
   in S3 and checks size, type and checksum, then marks the photo `verified`,
   attaches it to the ticket, logs a `photo` event, and moves an open ticket to
   `in_progress`. If verification fails, the row becomes `failed`; request a new
   upload and try again.
5. To show a photo later, call **`get_ticket(ticketId)`** (each verified photo
   includes a fresh signed `url`) or **`request_ticket_photo_download(photoId)`**.

Uploads are only accepted while the ticket is `open` or `in_progress`.

## Verify it works

After uploading and confirming one photo from the app:

```powershell
spacetime sql hackutd2026 --server local "SELECT id, ticket_id, step_order, status, storage_bucket, storage_key FROM ticket_photos"
```

The row should show `status = "verified"`, and the object should appear in the S3
console under the `storage_key` path. A row stuck at `requested` means the PUT
never happened or confirm was never called; `failed` means S3's object didn't
match the size, type or checksum that was requested.

## Housekeeping

- A requested upload that is never confirmed leaves at most an unattached S3
  object (if the PUT happened). These are harmless; to clean them up periodically,
  you can add an S3 lifecycle rule on the photo prefix, but only if you also
  accept losing confirmed photos older than that age.
- Photos are private. Signed URLs are the only way to view them and expire after
  5 minutes. Never make the bucket public.
