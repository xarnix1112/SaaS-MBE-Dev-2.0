# Guide de Test : Nouvelle Demande Typeform

## 🎯 Objectif
Tester que le bordereau est correctement extrait, lié et analysé automatiquement pour une nouvelle demande Typeform.

## ✅ Corrections appliquées

### Commit `e915683` : Extraction du nom de fichier
- ✅ Extraction du nom de fichier depuis l'URL Typeform
- ✅ Décodage des caractères spéciaux
- ✅ Logs de debugging ajoutés

### Commit `ce0b73c` : Correction du mapping des colonnes ⭐ **CRITIQUE**
- ✅ **Colonne 26 (Z)** : 📎 Ajouter votre bordereau (au lieu de 22)
- ✅ **Colonne 27 (AA)** : Submitted At (au lieu de 25)
- ✅ **Colonne 28 (AB)** : Token (au lieu de 26)
- ✅ **Colonne 24 (X)** : Informations utiles (au lieu de 23)
- ✅ **Colonne 25 (Y)** : Assurance (au lieu de 24)

## 📋 Étapes du test

### 1. Remplir un nouveau formulaire Typeform

1. **Ouvre le formulaire Typeform** de demande de devis
2. **Remplis toutes les informations** :
   - Nom, prénom, email, téléphone
   - Adresse de livraison
   - **IMPORTANT** : Attache un bordereau (PDF)
   - Choisis si tu veux une assurance
   - Ajoute des informations utiles si besoin
3. **Soumets le formulaire**
4. **Note l'heure de soumission** (pour vérifier les logs)

### 2. Attendre la synchronisation (90 secondes max)

Le système synchronise automatiquement toutes les **90 secondes**.

**Surveille les logs du terminal** :

```
[Google Sheets Sync] 🔄 Synchronisation de 1 compte(s) SaaS avec Google Sheets...
[Google Sheets Sync] 🔗 Bordereau link trouvé (col 26): https://api.typeform.com/responses/files/...
[Google Sheets Sync] 📄 Nom du fichier extrait: bordereau_acheteur_...pdf
[Google Sheets Sync] 📅 Submitted At (col 27): 19/01/2026 17:45:22
[Google Sheets Sync] 🔑 Token Typeform (col 28): abc123xyz456...
[Google Sheets Sync] ✅ Devis créé pour la ligne 11 (Prénom Nom)
[Bordereau Search] Recherche par nom de fichier: "bordereau acheteur ..." (original: "bordereau_acheteur_...pdf")
[Bordereau Search] ✅ Bordereau trouvé via filename: ca0936feeca3-bordereau_acheteur_...pdf
[API] ✅ Bordereau trouvé et lié pour devis ...
```

### 3. Vérifier dans l'application

1. **Rafraîchis la page** (F5) ou attends 30 secondes (auto-refresh)
2. **Vérifie que le nouveau devis apparaît** dans la liste
3. **Clique sur "Voir détails"**
4. **Vérifie les informations** :
   - ✅ Nom du client correct
   - ✅ Email correct
   - ✅ Adresse de livraison correcte
   - ✅ Assurance (si demandée)
   - ✅ Informations utiles (si ajoutées)

### 4. Vérifier le bordereau

**Dans la section "Bordereau"** :

1. **Clique sur "Voir le bordereau"**
2. **Tu devrais voir** :
   - ✅ Le nom du fichier : `bordereau_acheteur_...pdf`
   - ✅ Les informations extraites par OCR :
     - Salle des ventes (ex: "Boisgirard Antonini")
     - Numéro de bordereau (ex: "32320")
     - Date de la vente
     - Liste des lots avec prix
     - Total
   - ✅ Les suggestions de cartons
   - ✅ Le calcul du prix d'emballage
   - ✅ Le calcul du prix d'expédition
   - ✅ Le total du devis

**Si tout est correct** ✅ : Le système fonctionne parfaitement !

**Si le bordereau n'est pas visible** ❌ : Voir la section "Debugging" ci-dessous.

## 🔍 Vérification dans Firestore

### Collection `quotes`

1. **Va dans Firebase Console** > Firestore > `quotes`
2. **Trouve le nouveau devis** (le dernier créé)
3. **Vérifie les champs** :
   - ✅ `bordereauLink` : `https://api.typeform.com/responses/files/.../bordereau_acheteur_...pdf`
   - ✅ `bordereauFileName` : `bordereau_acheteur_...pdf`
   - ✅ `typeformToken` : `abc123xyz456...` (doit être rempli)
   - ✅ `typeformSubmittedAt` : `19/01/2026 17:45:22` (date correcte, pas une URL)
   - ✅ `bordereauId` : `...` (ID du document bordereau lié)
   - ✅ `status` : `waiting_for_ocr` ou `to_verify` (si OCR terminé)

### Collection `bordereaux`

1. **Va dans Firebase Console** > Firestore > `bordereaux`
2. **Trouve le bordereau** (filtre par `devisId` = ID du nouveau devis)
3. **Vérifie les champs** :
   - ✅ `saasAccountId` : `y02DtERgj6YTmuipZ8jn`
   - ✅ `devisId` : ID du devis
   - ✅ `driveFileId` : ID du fichier dans Google Drive
   - ✅ `originalName` : `ca0936feeca3-bordereau_acheteur_...pdf`
   - ✅ `status` : `uploaded` ou `ocr_complete`
   - ✅ `ocrResult` : Objet avec les données extraites (lots, prix, etc.)

## 🐛 Debugging si ça ne fonctionne pas

### Problème 1 : Aucun log `[Google Sheets Sync]` dans le terminal

**Cause** : Le polling n'est pas actif ou le Google Sheet n'est pas connecté.

**Solution** :
1. Va dans Paramètres > Google Sheets
2. Vérifie que le Google Sheet est bien connecté
3. Vérifie que le bon fichier est sélectionné
4. Redémarre le serveur si nécessaire

### Problème 2 : Log `⚠️  Aucun lien bordereau trouvé`

**Cause** : Le lien du bordereau n'est pas dans la colonne 26 (Z).

**Solution** :
1. Ouvre le Google Sheet Typeform
2. Vérifie que la colonne 26 (Z) contient bien le lien du bordereau
3. Vérifie que c'est un hyperlien (cliquable)
4. Si le lien est dans une autre colonne, corrige le mapping dans `ai-proxy.js`

### Problème 3 : `typeformToken` ou `typeformSubmittedAt` vides

**Cause** : Les colonnes 27 (AA) ou 28 (AB) sont vides ou mal lues.

**Solution** :
1. Ouvre le Google Sheet Typeform
2. Vérifie que la colonne 27 (AA) contient "Submitted At"
3. Vérifie que la colonne 28 (AB) contient "Token"
4. Si les colonnes sont différentes, corrige le mapping dans `ai-proxy.js`

### Problème 4 : Bordereau non trouvé dans Google Drive

**Cause** : Le fichier n'est pas dans le dossier configuré ou le nom ne correspond pas.

**Solution** :
1. Va dans Google Drive > "Test SaaS SDV"
2. Vérifie que le fichier `ca0936feeca3-bordereau_acheteur_...pdf` existe
3. Vérifie que le préfixe correspond au hash Typeform
4. Vérifie les logs pour voir quelle stratégie de recherche a été utilisée :
   ```
   [Bordereau Search] Recherche par nom de fichier: "..."
   [Bordereau Search] ✅ Bordereau trouvé via filename: ...
   ```

### Problème 5 : OCR ne se lance pas

**Cause** : Le bordereau est lié mais l'OCR ne démarre pas.

**Solution** :
1. Vérifie dans Firestore > `bordereaux` que `status` = `uploaded`
2. Vérifie les logs pour voir si l'OCR a été déclenché :
   ```
   [OCR] 🚀 Démarrage OCR pour bordereau ...
   [OCR] ✅ OCR terminé pour bordereau ...
   ```
3. Si l'OCR échoue, vérifie les logs d'erreur

## 📊 Logs attendus (succès complet)

```
[Google Sheets Sync] 🔄 Synchronisation de 1 compte(s) SaaS avec Google Sheets...
[Google Sheets Sync] 🔗 Bordereau link trouvé (col 26): https://api.typeform.com/responses/files/93996be8b74acbe92df544b7597b07874e2496f74d57109c253388fb3870e263/bordereau_acheteur_dong_chenyi_AV_260_025_rel.pdf
[Google Sheets Sync] 📄 Nom du fichier extrait: bordereau_acheteur_dong_chenyi_AV_260_025_rel.pdf
[Google Sheets Sync] 📅 Submitted At (col 27): 19/01/2026 17:45:22
[Google Sheets Sync] 🔑 Token Typeform (col 28): ljfh2u4zeqhqljfhl109vjppis2h1zcx
[Google Sheets Sync] ✅ Devis créé pour la ligne 11 (Dong Chenyi)
[Bordereau Search] Recherche par nom de fichier: "bordereau acheteur dong chenyi" (original: "bordereau_acheteur_dong_chenyi_AV_260_025_rel.pdf")
[Bordereau Search] ✅ Bordereau trouvé via filename: 0abdcf570976-bordereau_acheteur_dong_chenyi_AV_260_025_rel.pdf
[Bordereau Link] ✅ Bordereau lié au devis (ID: ...)
[OCR] 🚀 Démarrage OCR pour bordereau ...
[OCR] 📄 Fichier téléchargé depuis Drive (1.2 MB)
[OCR] 🔍 Extraction des données...
[OCR] ✅ OCR terminé: 8 lots trouvés, total: 75.83€
[OCR] ✅ Devis mis à jour avec les données OCR
[Google Sheets Sync] ✅ lastRowImported mis à jour: 11 (10 lignes de données, 1 nouveau(x) devis créé(s))
[Google Sheets Sync] ✅ Synchronisation terminée pour saasAccountId: y02DtERgj6YTmuipZ8jn, 1 nouveau(x) devis créé(s)
```

## ✅ Checklist de validation

- [ ] Nouveau formulaire Typeform rempli avec bordereau
- [ ] Logs `[Google Sheets Sync]` apparaissent dans le terminal (< 90 sec)
- [ ] Log `🔗 Bordereau link trouvé (col 26)` avec l'URL Typeform
- [ ] Log `📄 Nom du fichier extrait` avec le nom correct
- [ ] Log `📅 Submitted At (col 27)` avec la date correcte
- [ ] Log `🔑 Token Typeform (col 28)` avec le token
- [ ] Log `✅ Devis créé pour la ligne X`
- [ ] Log `[Bordereau Search]` avec recherche par nom de fichier
- [ ] Log `✅ Bordereau trouvé via filename`
- [ ] Log `[OCR]` avec extraction des données
- [ ] Devis visible dans l'application
- [ ] Bordereau visible dans la page de détail du devis
- [ ] Données OCR affichées (salle des ventes, lots, prix)
- [ ] Calcul du devis fonctionnel
- [ ] Firestore : `bordereauLink`, `bordereauFileName`, `typeformToken`, `typeformSubmittedAt` remplis
- [ ] Firestore : Document `bordereau` créé et lié au devis

## 🎉 Résultat attendu

**Workflow complet automatisé** :

1. ✅ Formulaire Typeform soumis avec bordereau
2. ✅ Google Sheets synchronisé (< 90 sec)
3. ✅ Devis créé dans Firestore avec toutes les données
4. ✅ Bordereau recherché et trouvé dans Google Drive
5. ✅ Bordereau lié au devis
6. ✅ OCR lancé automatiquement
7. ✅ Données extraites et devis calculé
8. ✅ Devis visible dans l'application avec bordereau analysé

**Temps total** : < 2 minutes de bout en bout ! 🚀

---

**Date** : 19 janvier 2026  
**Version** : 1.5.2  
**Commits** : `e915683`, `ce0b73c`

