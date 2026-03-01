# Extraction hybride de bordereaux (pdfplumber)

## Vue d'ensemble

Une extraction hybride des lots de bordereaux a été ajoutée, combinant :

1. **`extract_tables()`** — pour les PDF avec structure tabulaire (colonnes, lignes)
2. **`extract_form_structure`** — pour les zones sans tableau (labels + lignes horizontales + row_boundaries)

Cette approche vise à mieux gérer les bordereaux de salles différentes et à limiter la maintenance de parsers spécifiques.

---

## Activation / désactivation

### Activer l’extraction hybride

Dans les variables d’environnement du backend (Railway, `.env`, etc.) :

```
USE_PDFPLUMBER_BORDEREAU=true
```

ou

```
USE_PDFPLUMBER_BORDEREAU=1
```

### Revenir à l’ancien système

Pour désactiver l’extraction hybride et revenir uniquement à l’ancienne extraction :

1. Supprimer la variable `USE_PDFPLUMBER_BORDEREAU`,  
   **ou**
2. La définir explicitement :
   ```
   USE_PDFPLUMBER_BORDEREAU=false
   ```

Sans cette variable, l’extraction classique (pdfjs + heuristiques) est utilisée.

---

## Comportement

1. **PDF natif** : le système hybride est tenté en premier (si la variable est activée).
2. **Résultat exploitable** : si des lots sont extraits, ils remplacent ceux de l’extraction classique.
3. **Pas de résultat ou erreur** : retour automatique à l’extraction classique.
4. **PDF scanné** : l’extraction hybride n’est pas utilisée (OCR Tesseract comme avant).
5. **Images** : inchangé (OCR Tesseract).

---

## Prérequis techniques

- **Environnement virtuel** : `.venv-pdf/` à la racine du projet.
- **Dépendances** : `pypdf`, `pdfplumber`, `pdf2image`, `Pillow` (déjà installés dans ce venv).
- **Script** : `.cursor/skills/pdf/scripts/extract_bordereau_hybrid.py`.

Pour réinstaller les dépendances :

```bash
cd /chemin/vers/projet
.venv-pdf/bin/pip install -r .cursor/skills/pdf/scripts/requirements.txt
```

---

## Test manuel du script Python

```bash
cd /chemin/vers/projet
.venv-pdf/bin/python .cursor/skills/pdf/scripts/extract_bordereau_hybrid.py mon_bordereau.pdf
```

Sortie JSON sur stdout : `{ "success": true, "lots": [...], "method": "tables"|"structure", ... }`.

---

## Fichiers modifiés

| Fichier | Rôle |
|---------|------|
| `front end/server/ai-proxy.js` | Fonction `tryPdfplumberHybridExtraction`, branchement dans `extractBordereauFromFile` |
| `.cursor/skills/pdf/scripts/extract_bordereau_hybrid.py` | Script Python hybride (tableaux + structure) |

---

## Rollback

1. Mettre `USE_PDFPLUMBER_BORDEREAU=false` ou supprimer la variable.
2. Redémarrer le backend.

Le code de l’extraction classique reste inchangé et est toujours utilisé en cas de non-activation de l’hybride ou d’échec.
