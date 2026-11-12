interface Env {
  R2_QUOTA_KV: KVNamespace;
  R2_BUCKET: R2Bucket;
}

interface R2UploadRequest {
  key: string;
  contentType?: string;
  data: ArrayBuffer;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Only allow PUT/POST for uploads
    if (request.method !== 'PUT' && request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    // Check if uploads are disabled due to quota
    const disabled = await env.R2_QUOTA_KV.get('uploads_disabled');
    if (disabled === 'true') {
      return new Response(
        JSON.stringify({ 
          error: 'R2 quota exceeded (10GB limit). Uploads temporarily disabled.',
          code: 'QUOTA_EXCEEDED'
        }),
        { 
          status: 403, 
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Extract key from URL path or query
    const url = new URL(request.url);
    const key = url.searchParams.get('key') || url.pathname.slice(1);
    
    if (!key) {
      return new Response(
        JSON.stringify({ error: 'Missing key parameter' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    try {
      // Validate content type
      const contentType = request.headers.get('content-type') || 'application/octet-stream';
      
      // Read body
      const body = await request.arrayBuffer();
      
      // Upload to R2
      await env.R2_BUCKET.put(key, body, {
        httpMetadata: { contentType },
        customMetadata: {
          uploadedAt: new Date().toISOString(),
          uploadedBy: request.headers.get('cf-connecting-ip') || 'unknown'
        }
      });

      return new Response(
        JSON.stringify({ 
          success: true, 
          key,
          size: body.byteLength
        }),
        { 
          status: 200, 
          headers: { 'Content-Type': 'application/json' }
        }
      );

    } catch (error) {
      console.error('Upload failed:', error);
      return new Response(
        JSON.stringify({ 
          error: 'Upload failed', 
          details: error instanceof Error ? error.message : 'Unknown error'
        }),
        { 
          status: 500, 
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
  }
};