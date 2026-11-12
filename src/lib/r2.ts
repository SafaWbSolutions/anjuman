/**
 * Cloudflare R2 Storage Utility
 * 
 * Uses S3-compatible API. Requires these env vars:
 * - R2_ACCOUNT_ID
 * - R2_ACCESS_KEY_ID
 * - R2_SECRET_ACCESS_KEY
 * - R2_BUCKET_NAME (default: "anjuman-assets")
 * - R2_PUBLIC_URL (optional, for custom domain)
 */

// Type declarations for Edge Runtime compatibility
interface S3ClientConfig {
  region: string;
  endpoint: string;
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
  };
}

interface PutObjectCommandInput {
  Bucket: string;
  Key: string;
  Body: Uint8Array | Buffer | ReadableStream;
  ContentType?: string;
  CacheControl?: string;
  Metadata?: Record<string, string>;
}

interface GetObjectCommandInput {
  Bucket: string;
  Key: string;
}

interface DeleteObjectCommandInput {
  Bucket: string;
  Key: string;
}

interface S3Client {
  send(command: any): Promise<any>;
}

// Dynamic import for S3 client (works in both Node and Edge)
export async function getS3Client(): Promise<any> {
  const { S3Client } = await import("@aws-sdk/client-s3");
  return new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
    },
  });
}

/**
 * Upload a file to R2
 */
export async function uploadToR2(
  file: File | Buffer | Uint8Array,
  key: string,
  options: {
    contentType?: string;
    cacheControl?: string;
    bucket?: string;
  } = {}
): Promise<string> {
  const bucket = options.bucket || process.env.R2_BUCKET_NAME || "anjuman-assets";
  
  // Convert file to Uint8Array
  let body: Uint8Array;
  if (file instanceof File) {
    const arrayBuffer = await file.arrayBuffer();
    body = new Uint8Array(arrayBuffer);
  } else if (file instanceof Buffer) {
    body = new Uint8Array(file);
  } else {
    body = file;
  }

  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const client = await getS3Client();

  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME || "anjuman-assets",
    Key: key,
    Body: body,
    ContentType: options.contentType || "application/octet-stream",
    CacheControl: options.cacheControl || "public, max-age=31536000, immutable",
  } as PutObjectCommandInput);

  await client.send(command);

  // Return public URL
  const publicUrl = process.env.R2_PUBLIC_URL 
    ? `${process.env.R2_PUBLIC_URL}/${key}`
    : `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${process.env.R2_BUCKET_NAME || "anjuman-assets"}/${key}`;
  
  return publicUrl;
}

/**
 * Delete a file from R2
 */
export async function deleteFromR2(key: string, bucket?: string): Promise<void> {
  const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
  const client = await getS3Client();

  const command = new DeleteObjectCommand({
    Bucket: bucket || process.env.R2_BUCKET_NAME || "anjuman-assets",
    Key: key,
  } as DeleteObjectCommandInput);

  await client.send(command);
}

/**
 * Generate a presigned URL for direct browser upload (optional)
 * Useful for large files to avoid proxying through your server
 */
export async function generatePresignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn = 3600
): Promise<{ uploadUrl: string; key: string }> {
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  const client = await getS3Client();

  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME || "anjuman-assets",
    Key: key,
    ContentType: contentType,
  } as PutObjectCommandInput);

  const uploadUrl = await getSignedUrl(client, command, { expiresIn });
  return { uploadUrl, key };
}

/**
 * Check if R2 is configured
 */
export function isR2Configured(): boolean {
  return !!(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME
  );
}