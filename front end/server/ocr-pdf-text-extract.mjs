/**
 * Worker pour l'extraction de texte depuis un PDF natif (sans OCR).
 * Utilise getTextContent() uniquement — pas de rendu, pas de chargement de polices.
 *
 * Usage: node ocr-pdf-text-extract.mjs <pdf-path>
 * Sortie JSON: { pages: [...], ocrRawText: string, charCount: number }
 * En cas d'échec ou PDF scanné (peu de texte): { error: string } ou charCount < seuil
 */

import path from "path";
import fs from "fs";
import { fileURLToPath, pathToFileURL } from "url";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const { getDocument } = require("pdfjs-dist/legacy/build/pdf.js");

const MIN_CHARS_FOR_NATIVE = 50; // Seuil minimal pour considérer un PDF comme natif
const MAX_PAGES = 20;

function textItemToWord(item, pageHeight) {
  const str = (item.str || "").trim();
  if (!str) return null;
  const t = item.transform || [1, 0, 0, 1, 0, 0];
  const w = item.width ?? 0;
  const h = item.height ?? 12;
  const x0 = t[4];
  const yPdf = t[5];
  const y0 = pageHeight - yPdf - h;
  const y1 = pageHeight - yPdf;
  const x1 = x0 + w;
  return {
    text: str,
    confidence: 1,
    bbox: { x0, y0, x1, y1 },
  };
}

async function main() {
  const pdfPath = process.argv[2];
  if (!pdfPath || !fs.existsSync(pdfPath)) {
    process.stderr.write(JSON.stringify({ error: "PDF path required and must exist" }));
    process.exit(1);
  }

  try {
    const doc = await getDocument({
      url: pathToFileURL(path.resolve(pdfPath)).href,
      disableFontFace: true,
      useSystemFonts: true,
    }).promise;

    const numPages = Math.min(doc.numPages, MAX_PAGES);
    const pages = [];
    let ocrRawText = "";
    let totalChars = 0;

    for (let i = 1; i <= numPages; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: 1 });
      const pageHeight = viewport.height;

      const textContent = await page.getTextContent({});
      const items = textContent.items || [];

      const words = [];
      let pageText = "";
      for (const item of items) {
        const word = textItemToWord(item, pageHeight);
        if (word) {
          words.push(word);
          pageText += (item.hasEOL ? "\n" : " ") + word.text;
        }
      }
      pageText = pageText.replace(/\s+/g, " ").trim();

      const lines = buildLinesFromWords(words);
      pages.push({
        pageIndex: i - 1,
        lines,
        words,
        confidence: 1,
        text: pageText,
      });
      ocrRawText += `\n\n--- PAGE ${i}/${numPages} ---\n${pageText}`;
      totalChars += pageText.replace(/\s/g, "").length;
    }

    const result = {
      pages,
      ocrRawText: ocrRawText.trim(),
      charCount: totalChars,
      isNative: totalChars >= MIN_CHARS_FOR_NATIVE,
    };
    process.stdout.write(JSON.stringify(result));
  } catch (err) {
    process.stderr.write(JSON.stringify({ error: err.message }));
    process.exit(1);
  }
}

function buildLinesFromWords(words) {
  const cleaned = (words || [])
    .filter((w) => w && w.text && w.bbox)
    .map((w) => ({
      text: w.text.trim(),
      bbox: w.bbox,
      x: (w.bbox.x0 + w.bbox.x1) / 2,
      y: (w.bbox.y0 + w.bbox.y1) / 2,
    }));
  if (cleaned.length === 0) return [];
  const minX = Math.min(...cleaned.map((w) => w.bbox.x0));
  const maxX = Math.max(...cleaned.map((w) => w.bbox.x1));
  const minY = Math.min(...cleaned.map((w) => w.bbox.y0));
  const maxY = Math.max(...cleaned.map((w) => w.bbox.y1));
  const W = Math.max(1, maxX - minX);
  const H = Math.max(1, maxY - minY);

  const sorted = cleaned
    .map((w) => ({
      ...w,
      xn: (w.x - minX) / W,
      yn: (w.y - minY) / H,
      x0n: (w.bbox.x0 - minX) / W,
      x1n: (w.bbox.x1 - minX) / W,
    }))
    .sort((a, b) => a.yn - b.yn || a.x0n - b.x0n);

  const rows = [];
  const yThreshold = 0.012;
  for (const w of sorted) {
    const last = rows[rows.length - 1];
    if (!last || Math.abs(last.yn - w.yn) > yThreshold) {
      rows.push({ yn: w.yn, words: [w] });
    } else {
      last.words.push(w);
      last.yn = (last.yn * (last.words.length - 1) + w.yn) / last.words.length;
    }
  }
  for (const r of rows) r.words.sort((a, b) => a.x0n - b.x0n);
  return rows.map((r) => ({
    yn: r.yn,
    text: r.words.map((w) => w.text).join(" ").replace(/\s+/g, " ").trim(),
    words: r.words,
    x0: Math.min(...r.words.map((w) => w.x0n)),
    x1: Math.max(...r.words.map((w) => w.x1n)),
  }));
}

main();
