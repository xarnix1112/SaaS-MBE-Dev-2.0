#!/usr/bin/env python3
"""
Extraction hybride de lots depuis un bordereau PDF.
Combine extract_tables() pour les zones tabulaires et extract_form_structure 
pour les zones sans tableau.

Usage: python extract_bordereau_hybrid.py <input.pdf>
Sortie JSON sur stdout: { lots, ocrRawText, method, pagesWithTables, pagesWithStructure }
"""

import json
import re
import sys

try:
    import pdfplumber
except ImportError:
    pdfplumber = None


def normalize_amount(raw):
    """Convertit une chaîne prix en nombre (compatible normalizeAmountStrict Node)."""
    if raw is None:
        return None
    s = str(raw).strip()
    if not s:
        return None
    s = s.replace("\u00A0", " ").replace("EUR", "").replace("€", "")
    s = re.sub(r"[^\d.,\s]", "", s).replace(" ", "")
    if not s:
        return None
    if "." in s and "," in s:
        s = s.replace(".", "").replace(",", ".")
    elif "," in s:
        s = s.replace(",", ".")
    try:
        n = float(s)
        return n if (n == n and n != float("inf")) else None
    except (ValueError, TypeError):
        return None


def is_plausible_lot_number(raw):
    """Vérifie si la valeur ressemble à un numéro de lot (1-9999)."""
    if raw is None or raw == "":
        return False
    s = str(raw).strip()
    m = re.match(r"^(\d{1,4})$", s)
    if not m:
        return False
    n = int(m.group(1))
    return 1 <= n <= 9999


def looks_like_price(val):
    """Détecte si une cellule contient un prix."""
    if val is None:
        return False
    s = str(val).strip()
    if not s:
        return False
    if re.search(r"€|EUR", s, re.I):
        return True
    if re.match(r"^\d{1,3}[,\u00A0.]\d{2}$", s):
        return True
    if re.match(r"^\d[\d\s.,]*\d$", s) and re.search(r"[,\u00A0.]", s):
        return True
    return False


def looks_like_lot_header(s):
    """Détecte si un en-tête de colonne indique le numéro de lot."""
    if not s:
        return False
    s = s.lower().strip()
    return any(k in s for k in ["lot", "ligne", "n°", "numero", "ref", "nº", "no"])


def looks_like_desc_header(s):
    """Détecte si un en-tête indique la description."""
    if not s:
        return False
    s = s.lower().strip()
    return any(k in s for k in ["description", "désignation", "article", "designation"])


def looks_like_price_header(s):
    """Détecte si un en-tête indique le prix."""
    if not s:
        return False
    s = s.lower().strip()
    return any(k in s for k in ["prix", "adjudication", "hammer", "montant", "amount"])


def is_header_row(row):
    """Détecte si la ligne est un en-tête de tableau."""
    if not row or not any(c for c in row if c):
        return False
    full = " ".join(str(c or "") for c in row).lower()
    return (
        looks_like_lot_header(full) and looks_like_desc_header(full)
    ) or looks_like_price_header(full)


def is_footer_row(row):
    """Détecte si la ligne est un pied de page (total, etc.)."""
    if not row or not any(c for c in row if c):
        return False
    full = " ".join(str(c or "") for c in row).lower()
    return bool(re.search(r"total|iban|bank|paiement|payment|commission|réglé|invoice\s+total|montant\s+total|taux|base\s+ht", full))


def infer_column_roles(header_row):
    """Déduit les rôles des colonnes à partir de l'en-tête."""
    lot_col = desc_col = price_col = None
    for i, cell in enumerate(header_row):
        c = (cell or "").strip().lower()
        if looks_like_lot_header(c):
            lot_col = i
        elif looks_like_desc_header(c):
            desc_col = i
        elif looks_like_price_header(c):
            price_col = i
    if lot_col is None or desc_col is None:
        return None, None, None
    if price_col is None:
        for i in range(len(header_row) - 1, -1, -1):
            if looks_like_price(header_row[i]):
                price_col = i
                break
    return lot_col, desc_col, price_col


def infer_columns_from_data(rows, max_sample=10):
    """Infère les colonnes à partir des données si pas d'en-tête clair."""
    if not rows:
        return None, None, None
    sample = rows[:max_sample]
    ncols = max(len(r) for r in sample)
    lot_col = desc_col = price_col = None
    for c in range(ncols):
        vals = [r[c] if c < len(r) else None for r in sample]
        vals = [str(v).strip() for v in vals if v]
        if not vals:
            continue
        if all(is_plausible_lot_number(v) for v in vals[:3] if v):
            if lot_col is None:
                lot_col = c
        elif any(looks_like_price(v) for v in vals):
            if price_col is None:
                price_col = c
        elif lot_col is not None and price_col is not None and desc_col is None:
            desc_col = c
    if lot_col is None and price_col is not None:
        desc_col = 0
    if desc_col is None and lot_col is not None and price_col is not None:
        for c in range(ncols):
            if c not in (lot_col, price_col):
                desc_col = c
                break
    return lot_col, desc_col, price_col


def extract_lot_from_table_row(row, lot_col, desc_col, price_col):
    """Extrait un lot depuis une ligne de tableau."""
    lot_val = str(row[lot_col]).strip() if lot_col is not None and lot_col < len(row) else None
    desc_val = str(row[desc_col]).strip() if desc_col is not None and desc_col < len(row) else None
    price_val = row[price_col] if price_col is not None and price_col < len(row) else None
    prix_marteau = normalize_amount(price_val)
    if not desc_val and not prix_marteau:
        return None
    return {
        "numero_lot": lot_val if is_plausible_lot_number(lot_val) else None,
        "description": (desc_val or "").strip(),
        "prix_marteau": prix_marteau,
        "total": round(prix_marteau * 1.20, 2) if prix_marteau else None,
    }


def extract_lots_from_tables(pdf):
    """Extrait les lots depuis les tableaux de toutes les pages."""
    all_lots = []
    pages_with_tables = 0
    with pdfplumber.open(pdf) as doc:
        for page_num, page in enumerate(doc.pages, 1):
            tables = page.extract_tables()
            if not tables:
                continue
            for table in tables:
                if not table or len(table) < 2:
                    continue
                header = table[0]
                lot_col, desc_col, price_col = infer_column_roles(header)
                if lot_col is None and desc_col is None:
                    lot_col, desc_col, price_col = infer_columns_from_data(table[1:])
                if desc_col is None and (lot_col is not None or price_col is not None):
                    for c in range(len(header)):
                        if c not in (lot_col or -1, price_col or -1):
                            desc_col = c
                            break
                for row in table[1:]:
                    if not row or is_footer_row(row):
                        break
                    if is_header_row(row):
                        continue
                    lot = extract_lot_from_table_row(row, lot_col, desc_col, price_col)
                    if lot and (lot["description"] or lot["prix_marteau"]):
                        all_lots.append(lot)
                        pages_with_tables = page_num
    return all_lots, pages_with_tables


def extract_form_structure_for_page(page, page_num):
    """Extrait labels, lines, row_boundaries pour une page."""
    labels = []
    words = page.extract_words()
    for w in words:
        labels.append({
            "page": page_num,
            "text": w["text"],
            "x0": float(w["x0"]),
            "top": float(w["top"]),
            "x1": float(w["x1"]),
            "bottom": float(w["bottom"]),
        })
    lines = []
    for line in (page.lines or []):
        if abs(float(line["x1"]) - float(line["x0"])) > page.width * 0.5:
            lines.append({"y": float(line["top"])})
    y_coords = sorted(set(l["y"] for l in lines)) if lines else []
    row_boundaries = []
    for i in range(len(y_coords) - 1):
        row_boundaries.append({"row_top": y_coords[i], "row_bottom": y_coords[i + 1]})
    if not row_boundaries and labels:
        y_vals = sorted(set((l["top"] + l["bottom"]) / 2 for l in labels))
        y_thresh = 10
        groups = []
        for y in y_vals:
            if not groups or y - groups[-1][-1] > y_thresh:
                groups.append([y])
            else:
                groups[-1].append(y)
        for g in groups:
            if len(g) >= 1:
                row_boundaries.append({"row_top": min(g) - 6, "row_bottom": max(g) + 6})
    return labels, row_boundaries


def extract_lots_from_structure(labels, row_boundaries, page_num):
    """Extrait les lots depuis labels groupés par row_boundaries."""
    if not labels or not row_boundaries:
        return []
    labels_page = [l for l in labels if l["page"] == page_num]
    if not labels_page:
        return []
    rows = []
    for rb in row_boundaries:
        rt, rb_bot = rb["row_top"], rb["row_bottom"]
        row_labels = [
            l for l in labels_page
            if rt <= (l["top"] + l["bottom"]) / 2 <= rb_bot
        ]
        row_labels.sort(key=lambda x: x["x0"])
        if row_labels:
            rows.append({"labels": row_labels, "y": (rt + rb_bot) / 2})
    lots = []
    header_y = None
    for row in rows:
        texts = [l["text"] for l in row["labels"]]
        full = " ".join(texts).lower()
        if is_header_row([full]):
            header_y = row["y"]
            continue
        if header_y and row["y"] <= header_y + 5:
            continue
        if is_footer_row([full]):
            break
        lot_num = None
        desc_parts = []
        price_raw = None
        for l in row["labels"]:
            t = l["text"].strip()
            if is_plausible_lot_number(t) and lot_num is None:
                lot_num = t
            elif looks_like_price(t):
                price_raw = t
            elif t and not re.match(r"^\d+$", t):
                desc_parts.append(t)
        prix_marteau = normalize_amount(price_raw)
        desc = " ".join(desc_parts).strip()
        if desc or prix_marteau:
            lots.append({
                "numero_lot": lot_num,
                "description": desc,
                "prix_marteau": prix_marteau,
                "total": round(prix_marteau * 1.20, 2) if prix_marteau else None,
            })
    return lots


def main():
    if len(sys.argv) < 2:
        sys.stderr.write("Usage: extract_bordereau_hybrid.py <input.pdf>\n")
        sys.exit(1)
    pdf_path = sys.argv[1]
    if pdfplumber is None:
        sys.stderr.write("Error: pdfplumber required. Run: pip install pdfplumber\n")
        sys.exit(1)

    lots = []
    ocr_raw_text = ""
    pages_with_tables = 0
    pages_with_structure = 0
    method = "none"

    try:
        with pdfplumber.open(pdf_path) as pdf:
            all_pages = list(pdf.pages)
            page_labels = {}
            page_boundaries = {}
            for i, page in enumerate(all_pages, 1):
                labels, boundaries = extract_form_structure_for_page(page, i)
                page_labels[i] = labels
                page_boundaries[i] = boundaries
                ocr_raw_text += f"\n\n--- PAGE {i}/{len(all_pages)} ---\n"
                ocr_raw_text += (page.extract_text() or "")

        lots_from_tables, pwt = extract_lots_from_tables(pdf_path)
        if lots_from_tables:
            lots = lots_from_tables
            pages_with_tables = pwt
            method = "tables"

        all_labels = [l for labels in page_labels.values() for l in labels]
        if not lots:
            for i in page_labels:
                page_lots = extract_lots_from_structure(
                    all_labels,
                    page_boundaries.get(i, []),
                    i
                )
                if page_lots:
                    lots.extend(page_lots)
                    pages_with_structure = i
            if lots and method == "none":
                method = "structure"
        if lots and method == "none":
            method = "hybrid"

        seen = set()
        dedup = []
        for l in lots:
            key = f"{l.get('numero_lot')}::{l.get('description', '')[:30]}"
            if key in seen:
                continue
            seen.add(key)
            dedup.append(l)

        result = {
            "success": True,
            "lots": dedup,
            "ocrRawText": ocr_raw_text.strip(),
            "method": method,
            "pagesWithTables": pages_with_tables,
            "pagesWithStructure": pages_with_structure,
        }
        sys.stdout.write(json.dumps(result, ensure_ascii=False))
    except Exception as e:
        sys.stderr.write(f"Error: {e}\n")
        sys.stdout.write(json.dumps({
            "success": False,
            "lots": [],
            "ocrRawText": "",
            "method": "error",
            "error": str(e),
        }, ensure_ascii=False))


if __name__ == "__main__":
    main()
