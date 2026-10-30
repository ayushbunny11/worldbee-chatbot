// Rules for files the user can attach. Keep these in sync with SUPPORTED_TYPES
// and MAX_FILE_BYTES in backend/app/documents.py.

export const ACCEPTED_TYPES = [".pdf", ".docx", ".txt", ".md", ".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"];
export const MAX_FILE_MB = 20;
// Shown to users. Scans and pictures are read with OCR, so they work too.
export const FILE_KINDS = "PDF, Word, text, Markdown or image";

// The site a web page came from, like "example.com".
export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// What to show under a file's name once it is indexed: size, pages, chunks and how much needed OCR.
export function describeDocument(doc) {
  const parts = [];
  if (doc.pages) parts.push(`${doc.pages} page${doc.pages === 1 ? "" : "s"}`);
  parts.push(`${doc.chunks} chunk${doc.chunks === 1 ? "" : "s"}`);
  if (doc.ocr_pages) parts.push(doc.pages ? `${doc.ocr_pages} read with OCR` : "read with OCR");
  if (doc.ocr_skipped) parts.push(`${doc.ocr_skipped} scanned page${doc.ocr_skipped === 1 ? "" : "s"} skipped`);
  return parts;
}

// Check a file before uploading it, so obvious problems show up instantly.
// Returns an error message, or null if the file looks fine.
export function checkFile(file) {
  const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  if (!ACCEPTED_TYPES.includes(ext)) return `Unsupported file type. Use ${ACCEPTED_TYPES.join(", ")}.`;
  if (file.size > MAX_FILE_MB * 1024 * 1024) return `The file is larger than ${MAX_FILE_MB} MB.`;
  return null;
}
