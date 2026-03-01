#!/usr/bin/env python3
"""
Conversion PDF → PNG via pdf2image (poppler).
Alternative au worker Node (pdfjs+canvas) qui peut échouer sur Linux/Railway
avec l'erreur "Failed to unwrap exclusive reference of CanvasElement".

Usage: python pdf-to-png.py <pdf-path> [max-pages]
Sortie JSON sur stdout: { pngPaths, pageCount, renderedPages }
"""

import json
import os
import sys

def main():
    if len(sys.argv) < 2:
        err = {"error": "Usage: pdf-to-png.py <pdf-path> [max-pages]"}
        sys.stderr.write(json.dumps(err))
        sys.exit(1)

    pdf_path = sys.argv[1]
    max_pages = int(sys.argv[2]) if len(sys.argv) > 2 else 10

    if not os.path.isfile(pdf_path):
        err = {"error": f"PDF not found: {pdf_path}"}
        sys.stderr.write(json.dumps(err))
        sys.exit(1)

    try:
        from pdf2image import convert_from_path
    except ImportError:
        err = {"error": "pdf2image not installed. Run: pip install pdf2image Pillow"}
        sys.stderr.write(json.dumps(err))
        sys.exit(1)

    try:
        out_dir = os.path.join(os.path.dirname(pdf_path), f"ocr-pngs-{os.getpid()}")
        os.makedirs(out_dir, exist_ok=True)

        # DPI ~288 pour correspondre au scale 4.0 du worker Node (72*4)
        images = convert_from_path(
            pdf_path,
            dpi=288,
            first_page=1,
            last_page=max_pages,
            fmt="png",
        )

        png_paths = []
        for i, img in enumerate(images):
            p = os.path.join(out_dir, f"page-{i+1}.png")
            img.save(p)
            png_paths.append(p)

        rendered = len(png_paths)
        result = {
            "pngPaths": png_paths,
            "pageCount": rendered,
            "renderedPages": rendered,
        }
        sys.stdout.write(json.dumps(result))
    except Exception as e:
        err = {"error": str(e)}
        sys.stderr.write(json.dumps(err))
        sys.exit(1)


if __name__ == "__main__":
    main()
