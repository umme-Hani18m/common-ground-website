import { randomUUID } from "node:crypto";
import { ENV } from "./_core/env";

const BUCKET = "citizen-attachments";
let bucketReady: Promise<void> | null = null;

function storageUrl(path = "") {
  return `${ENV.supabaseUrl.replace(/\/$/, "")}/storage/v1${path}`;
}

function headers() {
  if (!ENV.supabaseUrl || !ENV.supabaseServiceRoleKey) throw new Error("Supabase Storage is not configured on the server.");
  return { Authorization: `Bearer ${ENV.supabaseServiceRoleKey}`, apikey: ENV.supabaseServiceRoleKey };
}

async function ensureBucket() {
  if (!bucketReady) {
    bucketReady = (async () => {
      const response = await fetch(storageUrl("/bucket"), {
        method: "POST",
        headers: { ...headers(), "Content-Type": "application/json" },
        body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false, file_size_limit: 10 * 1024 * 1024 }),
      });
      if (!response.ok && response.status !== 409) {
        throw new Error(`Supabase Storage bucket setup failed (${response.status}).`);
      }
    })().catch(error => {
      bucketReady = null;
      throw error;
    });
  }
  await bucketReady;
}

export async function uploadSupabaseAttachment(input: {
  problemId: number;
  kind: "geotag_photo" | "aadhar_card";
  fileName: string;
  mimeType: string;
  bytes: Buffer;
}) {
  await ensureBucket();
  const extension = input.fileName.includes(".") ? input.fileName.slice(input.fileName.lastIndexOf(".")).toLowerCase() : "";
  const folder = input.kind === "aadhar_card" ? "aadhar" : "photos";
  const path = `problems/${input.problemId}/${folder}/${randomUUID()}${extension}`;
  const response = await fetch(storageUrl(`/object/${BUCKET}/${path}`), {
    method: "POST",
    headers: { ...headers(), "Content-Type": input.mimeType, "x-upsert": "false" },
    body: input.bytes.buffer.slice(input.bytes.byteOffset, input.bytes.byteOffset + input.bytes.byteLength) as ArrayBuffer,
  });
  if (!response.ok) throw new Error(`Supabase Storage upload failed (${response.status}).`);
  return { bucket: BUCKET, path };
}

export async function createSupabaseSignedUrl(path: string, expiresInSeconds = 300) {
  await ensureBucket();
  const response = await fetch(storageUrl(`/object/sign/${BUCKET}`), {
    method: "POST",
    headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify({ paths: [path], expiresIn: expiresInSeconds }),
  });
  if (!response.ok) throw new Error(`Supabase Storage preview signing failed (${response.status}).`);
  const payload = await response.json() as { signedURL?: string; signedUrl?: string; data?: { signedURL?: string; signedUrl?: string }[] };
  const signed = payload.signedURL ?? payload.signedUrl ?? payload.data?.[0]?.signedURL ?? payload.data?.[0]?.signedUrl;
  if (!signed) throw new Error("Supabase Storage returned no signed preview URL.");
  return signed.startsWith("http") ? signed : `${ENV.supabaseUrl.replace(/\/$/, "")}/storage/v1${signed}`;
}

export function supabaseStorageConfigured() {
  return Boolean(ENV.supabaseUrl && ENV.supabaseServiceRoleKey);
}

export { BUCKET };
