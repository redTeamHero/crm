import { Storage } from "@google-cloud/storage";
import fs from "fs";
import path from "path";

const SIDECAR = "http://127.0.0.1:1106";

const storage = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${SIDECAR}/token`,
    type: "external_account",
    credential_source: {
      url: `${SIDECAR}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

function getBucketAndPrefix() {
  const dir = (process.env.PRIVATE_OBJECT_DIR || "").replace(/^\/+/, "");
  const parts = dir.split("/");
  const bucketName = parts[0];
  const prefix = parts.slice(1).join("/");
  if (!bucketName) throw new Error("PRIVATE_OBJECT_DIR not configured");
  return { bucketName, prefix };
}

function resolveKey(key) {
  const { bucketName, prefix } = getBucketAndPrefix();
  const objectName = prefix ? `${prefix}/${key}` : key;
  return { bucket: storage.bucket(bucketName), objectName };
}

export async function uploadFile(key, buffer, contentType = "application/octet-stream") {
  const { bucket, objectName } = resolveKey(key);
  const file = bucket.file(objectName);
  await file.save(buffer, { contentType, resumable: false });
  return key;
}

export async function downloadFile(key) {
  const { bucket, objectName } = resolveKey(key);
  const file = bucket.file(objectName);
  const [contents] = await file.download();
  return contents;
}

export async function downloadFileStream(key) {
  const { bucket, objectName } = resolveKey(key);
  const file = bucket.file(objectName);
  return file.createReadStream();
}

export async function getFileMetadata(key) {
  const { bucket, objectName } = resolveKey(key);
  const file = bucket.file(objectName);
  const [metadata] = await file.getMetadata();
  return {
    contentType: metadata.contentType || "application/octet-stream",
    size: Number(metadata.size) || 0,
  };
}

export async function fileExists(key) {
  try {
    const { bucket, objectName } = resolveKey(key);
    const file = bucket.file(objectName);
    const [exists] = await file.exists();
    return exists;
  } catch {
    return false;
  }
}

export async function deleteFile(key) {
  try {
    const { bucket, objectName } = resolveKey(key);
    const file = bucket.file(objectName);
    await file.delete({ ignoreNotFound: true });
    return true;
  } catch {
    return false;
  }
}

export async function streamToResponse(key, res) {
  const { bucket, objectName } = resolveKey(key);
  const file = bucket.file(objectName);
  const [exists] = await file.exists();
  if (!exists) return false;
  const [metadata] = await file.getMetadata();
  res.set({
    "Content-Type": metadata.contentType || "application/octet-stream",
    "Content-Length": metadata.size,
  });
  const stream = file.createReadStream();
  stream.on("error", (err) => {
    console.error("[objectStore] stream error:", err?.message);
    if (!res.headersSent) res.status(500).end();
  });
  stream.pipe(res);
  return true;
}

export function consumerFileKey(consumerId, storedName) {
  return `consumers/${consumerId}/uploads/${storedName}`;
}

export function letterFileKey(jobId, filename) {
  return `letters/${jobId}/${filename}`;
}

export function diyFileKey(userId, filename) {
  return `diy/${userId}/${filename}`;
}

export async function migrateLocalFile(localPath, objectKey, contentType) {
  if (!fs.existsSync(localPath)) return false;
  const buffer = fs.readFileSync(localPath);
  await uploadFile(objectKey, buffer, contentType || "application/octet-stream");
  return true;
}
