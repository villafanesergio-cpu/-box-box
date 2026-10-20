// Versioned, compressed posters served by the website instead of Supabase Storage.
const posterNames = new Set(["alvaro", "benja", "dodi", "eze", "fran", "gonzalo", "huevo", "lorenzo", "martin", "nico", "osky", "paila", "pasti", "rodri", "sergio"]);
export function isGif(url) {
  return typeof url === "string" && (/\.gif(?:[?#]|$)/i.test(url) || /^data:image\/gif[;,]/i.test(url));
}
export function staticImageUrl(url) {
  return url && !isGif(url) ? url : null;
}
export function getDriverPoster(name, currentUrl) {
  const slug = (name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  // Preserve future uploads made in Race Control; replace the original legacy portraits.
  const legacyPortrait = /\/driver-media\/background\/178\d+-/i.test(currentUrl || "");
  if (posterNames.has(slug) && (!staticImageUrl(currentUrl) || legacyPortrait)) {
    return `/posters/2026-10/${slug}.webp`;
  }
  return staticImageUrl(currentUrl);
}
export function assertStaticUpload(file) {
  if (file && (file.type === "image/gif" || isGif(file.name))) {
    throw new Error("Elegí una imagen fija JPG, PNG o WebP.");
  }
}
