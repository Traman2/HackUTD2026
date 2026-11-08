import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import {
  SenderError,
  type InferSchema,
  type ProcedureCtx,
} from "spacetimedb/server";
import type spacetimedb from "../schema";

type Context = ProcedureCtx<InferSchema<typeof spacetimedb>>;
export const URL_EXPIRY_SECONDS = 300;
const encode = (value: string) =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );

export function storageConfig(ctx: Context) {
  const {
    S3_BUCKET: bucket,
    S3_REGION: region,
    S3_ACCESS_KEY_ID: accessKeyId,
    S3_SECRET_ACCESS_KEY: secretAccessKey,
    S3_SESSION_TOKEN: sessionToken,
  } = ctx.env;
  if (!bucket || !region || !accessKeyId || !secretAccessKey) {
    throw new SenderError("S3 storage is not configured.");
  }
  // Virtual-hosted HTTPS: disallow dotted buckets (wildcard TLS mismatch).
  if (
    !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket) ||
    !/^[a-z]{2}(?:-[a-z]+)+-\d+$/.test(region)
  ) {
    throw new SenderError("Invalid S3 bucket or region configuration.");
  }
  const prefix = ctx.env.S3_PREFIX || "hackutd2026";
  if (!/^[a-zA-Z0-9_-]+$/.test(prefix))
    throw new SenderError("Invalid S3 prefix.");
  return { bucket, region, accessKeyId, secretAccessKey, sessionToken, prefix };
}

// Ticket photos may use a dedicated bucket (S3_PHOTO_BUCKET, optionally in
// S3_PHOTO_REGION) with the same credentials; otherwise they share the PDF
// bucket under the same prefix. Each photo row records its own bucket/region.
export function photoStorageConfig(ctx: Context) {
  const base = storageConfig(ctx);
  const bucket = ctx.env.S3_PHOTO_BUCKET || base.bucket;
  const region = ctx.env.S3_PHOTO_REGION || base.region;
  if (
    !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket) ||
    !/^[a-z]{2}(?:-[a-z]+)+-\d+$/.test(region)
  ) {
    throw new SenderError("Invalid S3 photo bucket or region configuration.");
  }
  return { ...base, bucket, region };
}

// SigV4 implemented with pure JS hashes so it can run inside the database VM.
export function presignS3(
  config: ReturnType<typeof storageConfig>,
  now: Date,
  method: "PUT" | "GET" | "HEAD" | "DELETE",
  key: string,
  headers: Record<string, string> = {},
  query: Record<string, string> = {},
): string {
  const dateTime = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = dateTime.slice(0, 8);
  const scope = `${date}/${config.region}/s3/aws4_request`;
  const host = `${config.bucket}.s3.${config.region}.amazonaws.com`;
  const path = `/${key.split("/").map(encode).join("/")}`;
  const canonicalHeaders: Record<string, string> = { ...headers, host };
  const headerNames = Object.keys(canonicalHeaders).sort();
  const signedHeaders = headerNames.join(";");
  const parameters: Record<string, string> = {
    ...query,
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${config.accessKeyId}/${scope}`,
    "X-Amz-Date": dateTime,
    "X-Amz-Expires": String(URL_EXPIRY_SECONDS),
    "X-Amz-SignedHeaders": signedHeaders,
  };
  if (config.sessionToken)
    parameters["X-Amz-Security-Token"] = config.sessionToken;
  const canonicalQuery = Object.entries(parameters)
    .map(([k, v]) => [encode(k), encode(v)])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const canonical = [
    method,
    path,
    canonicalQuery,
    headerNames
      .map(
        (name) =>
          `${name}:${canonicalHeaders[name].trim().replace(/\s+/g, " ")}\n`,
      )
      .join(""),
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    dateTime,
    scope,
    bytesToHex(sha256(utf8ToBytes(canonical))),
  ].join("\n");
  let signingKey = utf8ToBytes(`AWS4${config.secretAccessKey}`);
  for (const part of [date, config.region, "s3", "aws4_request"]) {
    signingKey = hmac(sha256, signingKey, utf8ToBytes(part));
  }
  return `https://${host}${path}?${canonicalQuery}&X-Amz-Signature=${bytesToHex(
    hmac(sha256, signingKey, utf8ToBytes(stringToSign)),
  )}`;
}
