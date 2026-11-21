/** Product images are Unsplash photo ids; clients can build other sizes with
 * the same URL pattern (see README). Mirrors ../../../lib/images.ts. */
export function unsplash(id: string, width: number, height?: number, quality = 80) {
  const params = new URLSearchParams({
    auto: "format",
    fit: "crop",
    w: String(width),
    q: String(quality),
  });
  if (height) params.set("h", String(height));
  return `https://images.unsplash.com/photo-${id}?${params.toString()}`;
}

/** Default size for image URLs embedded in API responses (4:5 portrait). */
export function productImageUrl(imageId: string) {
  return unsplash(imageId, 800, 1000);
}
