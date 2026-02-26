# Améliorations des modèles d'emails – Réponses et plan d'implémentation

## 1. Les espaces sont-ils gardés quand quelqu'un modifie le template ?

**Réponse : Oui, tant que l'utilisateur ne modifie pas le HTML.**

- Le `bodyHtml` est sauvegardé **tel quel** dans Firestore (`saasAccounts/{id}.emailTemplates.quote_send.bodyHtml`).
- Ce qui est enregistré est ce qui est renvoyé dans l’email.

**Problème :** L’utilisateur voit et modifie du **HTML brut** (`<div style="margin-bottom:24px;">`, `<p style="margin:0; line-height:1.6;">`, etc.). Si des balises sont supprimées ou mal modifiées, la mise en forme est perdue.

---

## 2. Éditeur simplifié sans HTML visible

**Objectif :** L’utilisateur ne voit pas le HTML et édite un contenu structuré de façon simple.

### Option A : Éditeur WYSIWYG (recommandé)

Utiliser un éditeur riche (TipTap, Lexical, Quill) avec :
- Saisie de texte normal
- Boutons : gras, italique, listes à puces, sauts de ligne
- Affichage visuel proche du rendu final

**Implémentation :**
1. Installer `@tiptap/react` (ou `react-quill`, `lexical`)
2. Remplacer le `<textarea>` par l’éditeur riche
3. L’éditeur renvoie du HTML (propre ou à nettoyer)
4. À l’envoi, wrapper ce HTML dans une structure de base (marges, conteneurs) si besoin

**Avantages :** Libre, bon rendu visuel  
**Inconvénients :** Dépendance npm, gestion du HTML produit (styles, balises)

---

### Option B : Champs texte structurés (plus simple)

Le template par défaut est découpé en sections. L’utilisateur ne modifie que le **texte** de chaque section, la mise en forme reste gérée par le code.

**Structure possible :**
- Introduction (Bonjour + paragraphe d’intro)
- Section 1 – Détail du devis (texte libre)
- Section 2 – Paiement (texte libre)
- Section 3 – Collecte (texte libre)
- Section 4 – Livraison (texte libre)
- Section 5 – CGV (texte libre)
- Section 6 – Facture (texte libre)
- Signature

**Implémentation :**
1. Dans Firestore : stocker des champs texte (`intro`, `section1`, `section2`, etc.) au lieu de `bodyHtml` brut.
2. Côté backend : construire le HTML final en injectant ces textes dans un template fixe (avec `<p>`, `<div>`, marges, etc.).

**Avantages :** Pas de HTML visible, rendu uniforme, moins de risques d’erreurs  
**Inconvénients :** Moins de liberté de mise en forme

---

### Option C : Markdown → HTML

L’utilisateur saisit en **Markdown** (paragraphes, listes, gras). À l’envoi, conversion Markdown → HTML avec une librairie (`marked`, `markdown-it`).

**Implémentation :**
1. Textarea avec aide à la saisie (ex. « Utilisez ** pour le gras, - pour les listes »)
2. Ou éditeur avec prévisualisation Markdown
3. Backend : `marked(markdownContent)` → HTML, puis injection dans la structure d’email

---

## 3. Logo dans le bandeau

**Oui, c’est possible.** Le bandeau est construit dans `buildEmailHtmlFromTemplate` dans `ai-proxy.js` :

```javascript
<div style="background:${bannerColor};color:white;padding:20px;...">
  <h1 style="margin:0;">${bannerTitle}</h1>
</div>
```

### Stockage du logo

**Option 1 : URL externe (rapide à implémenter)**  
- Champ texte : « URL du logo »  
- L’utilisateur colle une URL (site, Imgur, CDN, etc.)  
- Stockage : `bannerLogoUrl` dans `emailTemplates` ou `saasAccounts`  
- Rendu : `<img src="${bannerLogoUrl}" alt="Logo" style="max-height:60px;display:block;margin:0 auto 12px auto;" />` au-dessus du titre  

**Avantages :** Très simple, pas d’upload  
**Inconvénients :** L’URL doit rester stable et accessible

---

**Option 2 : Upload Firebase Storage (recommandé)**  
- Firebase Storage est déjà configuré (`VITE_FIREBASE_STORAGE_BUCKET`)  
- L’utilisateur choisit un fichier image  
- Upload vers `saasAccounts/{id}/email-logo.png` (ou avec nom unique)  
- Récupération de l’URL publique → stockage en `bannerLogoUrl`

**Implémentation :**
1. **Backend** : route `POST /api/saas-account/upload-logo`  
   - Multer pour recevoir le fichier  
   - Firebase Admin Storage pour l’upload (ou client si règles le permettent)
2. **Frontend** :  
   - Input fichier dans `EmailTemplatesSettings`  
   - Appel à l’API d’upload  
   - Affichage du logo actuel et possibilité de le supprimer
3. **Modification de `buildEmailHtmlFromTemplate`** :  
   - Si `template.bannerLogoUrl` existe, insérer une balise `<img>` au-dessus du titre

**Règles Firebase Storage :**  
- Permettre lecture publique pour les logos  
- Restreindre l’écriture aux utilisateurs authentifiés de ce compte

---

## Synthèse et ordre d’implémentation

| Priorité | Fonctionnalité                              | Difficulté | Recommandation                                      |
|----------|---------------------------------------------|------------|-----------------------------------------------------|
| 1        | Logo dans le bandeau (URL externe)          | Faible     | Commencer par l’URL ; ajouter l’upload ensuite     |
| 2        | Logo via upload Firebase Storage            | Moyenne    | Après l’URL si besoin de professionnaliser          |
| 3        | Éditeur simplifié (Option B ou A)           | Moyenne à haute | Option B pour une mise en place rapide et sûre |

---

## Détails techniques pour le logo (implémentation rapide)

### 1. Modifier `email-templates-extended.js`
- Ajouter `bannerLogoUrl` dans les defaults et dans `getTemplatesExtendedForAccount`

### 2. Modifier `buildEmailHtmlFromTemplate` (ai-proxy.js)
```javascript
const logoHtml = template.bannerLogoUrl
  ? `<img src="${template.bannerLogoUrl}" alt="Logo" style="max-height:60px;display:block;margin:0 auto 12px auto;" />`
  : '';
// Dans le bandeau :
<div style="...">
  ${logoHtml}
  <h1 style="margin:0;">${bannerTitle}</h1>
</div>
```

### 3. Modifier `EmailTemplatesSettings.tsx`
- Ajouter un champ `bannerLogoUrl` (Input ou champ URL)
- L’inclure dans le payload de sauvegarde

### 4. Modifier l’API PUT `/api/email-templates-extended`
- Accepter et stocker `bannerLogoUrl` dans Firestore
