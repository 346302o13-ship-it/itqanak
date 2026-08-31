/**
 * Shrink big photos in the browser before upload, the way a messenger does: cap
 * the long edge at 1600px and re-encode as JPEG so a multi-MB camera shot lands
 * as a few hundred KB. Non-images, tiny images, and unsupported environments
 * pass the original file straight through.
 */
export async function compressImageForUpload(original: File): Promise<File> {
  if (!/^image\/(jpe?g|png)$/iu.test(original.type)) return original;
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") {
    return original;
  }
  const maxDimension = 1600;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(original);
  } catch {
    return original;
  }
  try {
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && original.type === "image/jpeg" && original.size < 500_000) {
      return original;
    }
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (context === null) return original;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((value) => resolve(value), "image/jpeg", 0.82);
    });
    if (blob === null || blob.size >= original.size) return original;
    const base = original.name.replace(/\.[^.]+$/u, "") || "image";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  } finally {
    bitmap.close();
  }
}
