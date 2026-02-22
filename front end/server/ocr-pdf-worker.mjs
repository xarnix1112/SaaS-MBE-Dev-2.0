/**
 * Worker isolé pour le rendu PDF → PNG
 * Charge uniquement pdfjs-dist + @napi-rs/canvas (PAS sharp)
 * Évite le conflit GNotificationCenterDelegate entre sharp et canvas
 *
 * Usage: node ocr-pdf-worker.mjs <pdf-path>
 * Sortie JSON sur stdout: { pngPaths: string[], pageCount: number }
 */

import path from "path";
import fs from "fs";
import { fileURLToPath, pathToFileURL } from "url";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const { getDocument } = require("pdfjs-dist/legacy/build/pdf.js");
const { createCanvas } = await import("@napi-rs/canvas");

async function main() {
  const pdfPath = process.argv[2];
  if (!pdfPath || !fs.existsSync(pdfPath)) {
    process.stderr.write(JSON.stringify({ error: "PDF path required and must exist" }));
    process.exit(1);
  }

  const maxPages = 10;
  const scale = 4.0;
  const outDir = path.join(path.dirname(pdfPath), `ocr-pngs-${Date.now()}`);

  try {
    fs.mkdirSync(outDir, { recursive: true });

    // useSystemFonts: évite fetch() des polices (file:// et CDN échouent en Node)
    const doc = await getDocument({
      url: pathToFileURL(path.resolve(pdfPath)).href,
      disableFontFace: true,
      useSystemFonts: true,
    }).promise;

    const pageCount = Math.min(doc.numPages, maxPages);
    const pngPaths = [];

    for (let i = 1; i <= pageCount; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const ctx = canvas.getContext("2d");
      await page.render({ canvasContext: ctx, viewport }).promise;
      const pngPath = path.join(outDir, `page-${i}.png`);
      fs.writeFileSync(pngPath, canvas.toBuffer("image/png"));
      pngPaths.push(pngPath);
    }

    const result = { pngPaths, pageCount: doc.numPages, renderedPages: pageCount };
    process.stdout.write(JSON.stringify(result));
  } catch (err) {
    process.stderr.write(JSON.stringify({ error: err.message }));
    process.exit(1);
  }
}

main();
