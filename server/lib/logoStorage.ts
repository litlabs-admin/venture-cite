// Downloads a scraped brand logo and persists it to Supabase Storage.
// Favicons disappear when sites redesign; by mirroring once at onboarding we
// get a stable URL that's safe to render from our own infrastructure.
//
// The bucket must exist and be public. Create via Supabase dashboard or CLI:
//   bucket name: "brand-logos", public = true
// Service-role key (already in supabaseAdmin) bypasses RLS for upload.

import { supabaseAdmin } from "../supabase";
import { safeFetchBuffer } from "./ssrf";
import { logger } from "./logger";

const BUCKET = "brand-logos";
const MAX_BYTES = 1 * 1024 * 1024; // 1 MB

function extensionFromContentType(ct: string): string {
  const lower = ct.toLowerCase();
  if (lower.includes("png")) return "png";
  if (lower.includes("jpeg") || lower.includes("jpg")) return "jpg";
  if (lower.includes("svg")) return "svg";
  if (lower.includes("gif")) return "gif";
  if (lower.includes("webp")) return "webp";
  if (lower.includes("icon") || lower.includes("ico")) return "ico";
  return "bin";
}

export async function downloadAndStoreLogo(
  sourceUrl: string,
  brandIdOrKey: string,
): Promise<string | null> {
  let fetched;
  try {
    fetched = await safeFetchBuffer(sourceUrl, {
      maxBytes: MAX_BYTES,
      timeoutMs: 8_000,
    });
  } catch (err) {
    logger.warn({ err, sourceUrl }, "logoStorage: fetch failed");
    return null;
  }

  const { status, buffer, contentType } = fetched;
  if (status < 200 || status >= 300) {
    logger.warn({ sourceUrl, status }, "logoStorage: non-2xx from source");
    return null;
  }
  const ct = contentType.toLowerCase();
  const isImage = ct.startsWith("image/") || ct.includes("icon") || ct === "";
  if (!isImage) {
    logger.warn({ sourceUrl, contentType }, "logoStorage: not an image");
    return null;
  }
  if (!buffer || buffer.length === 0) return null;

  const ext = extensionFromContentType(contentType);
  const path = `${brandIdOrKey}.${ext}`;
  const uploadContentType = contentType || `image/${ext}`;

  const { error: uploadError } = await supabaseAdmin.storage.from(BUCKET).upload(path, buffer, {
    contentType: uploadContentType,
    upsert: true,
    cacheControl: "86400",
  });
  if (uploadError) {
    logger.warn({ err: uploadError, sourceUrl, path }, "logoStorage: upload failed");
    return null;
  }

  const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
  return data?.publicUrl ?? null;
}
