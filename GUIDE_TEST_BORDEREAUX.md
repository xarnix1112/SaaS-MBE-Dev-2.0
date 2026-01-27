# 🧪 Guide de Test - Système Bordereaux Automatique

**Version**: 1.5.0  
**Date**: 18 janvier 2026  
**Durée estimée**: 30-45 minutes

---

## 🎯 Objectif

Tester le workflow complet du système de bordereaux automatique, de la connexion Google Drive jusqu'au calcul automatique du devis.

---

## ✅ Prérequis

- [ ] Application démarrée (`npm run dev:all`)
- [ ] Compte SaaS MBE créé et configuré
- [ ] Compte Google avec accès à:
  - Google Sheets (Typeform)
  - Google Drive (dossier bordereaux)
- [ ] Au moins 1 bordereau PDF ou image dans le dossier Drive

---

## 📋 Tests à effectuer

### 1. Connexion Google Sheets (inclut Drive)

**Objectif**: Vérifier que l'OAuth Google inclut maintenant le scope Drive

**Étapes**:
1. Aller dans **Paramètres** → Onglet **Google Sheets**
2. Cliquer sur **Connecter Google Sheets**
3. Autoriser l'accès à Google Sheets **ET** Google Drive
4. Vérifier la redirection vers Settings avec `oauth_success=true`
5. Sélectionner un Google Sheet Typeform
6. Vérifier que le statut affiche "Connecté"

**Résultat attendu**:
- ✅ OAuth demande accès à Sheets + Drive
- ✅ Sheet sélectionné avec succès
- ✅ Statut "Connecté" affiché

---

### 2. Sélection dossier Google Drive

**Objectif**: Vérifier la sélection du dossier bordereaux

**Étapes**:
1. Aller dans **Paramètres** → Onglet **Google Drive**
2. Cliquer sur **Sélectionner le dossier bordereaux**
3. Vérifier que la liste des dossiers Drive s'affiche
4. Sélectionner le dossier contenant les bordereaux Typeform
5. Vérifier que le statut affiche "Dossier connecté"
6. Vérifier que le nom du dossier est affiché

**Résultat attendu**:
- ✅ Liste des dossiers Drive affichée
- ✅ Dossier sélectionné avec succès
- ✅ Statut "Dossier connecté" + nom du dossier

**Vérification Firestore**:
```javascript
// Dans Firestore Console
saasAccounts/{saasAccountId}/integrations/googleDrive
{
  connected: true,
  bordereauxFolderId: "...",
  bordereauxFolderName: "Bordereaux Typeform",
  connectedAt: Timestamp
}
```

---

### 3. Import Google Sheet avec includeGridData

**Objectif**: Vérifier l'extraction des hyperliens bordereaux

**Étapes**:
1. Ajouter une nouvelle ligne dans le Google Sheet Typeform avec:
   - Toutes les colonnes remplies (client, destinataire, etc.)
   - Un lien vers un bordereau dans la colonne 22 (📎 Ajouter votre bordereau)
2. Attendre 90 secondes (polling)
3. Aller dans **Tableau de bord** ou **Devis**
4. Vérifier qu'un nouveau devis a été créé
5. Cliquer sur "Voir détails" du devis
6. Vérifier les informations extraites

**Résultat attendu**:
- ✅ Devis créé automatiquement
- ✅ Lien bordereau extrait (si présent dans le Sheet)
- ✅ Status: `waiting_for_slip` ou `bordereau_linked`
- ✅ Champ `uniqueKey` présent
- ✅ Champ `submittedAt` présent

**Vérification Firestore**:
```javascript
// Dans Firestore Console
quotes/{devisId}
{
  saasAccountId: "...",
  uniqueKey: "saasAccountId::spreadsheetId::token",
  submittedAt: "2026-01-18T10:30:00Z",
  bordereauLink: "https://drive.google.com/...", // Si présent
  status: "waiting_for_slip" ou "bordereau_linked",
  // ... autres champs
}
```

---

### 4. Recherche automatique bordereau (Token)

**Objectif**: Tester la recherche par Token Typeform

**Étapes**:
1. Créer un nouveau devis via Google Sheet (sans lien bordereau dans le Sheet)
2. Uploader un bordereau dans le dossier Drive avec le **Token Typeform** dans le nom
   - Exemple: `bordereau_abc123xyz.pdf` (où `abc123xyz` est le Token)
3. Attendre 90 secondes (polling)
4. Vérifier dans **Firestore** que le bordereau a été lié
5. Vérifier que le devis a le champ `bordereauId`

**Résultat attendu**:
- ✅ Bordereau trouvé automatiquement (méthode: `token`)
- ✅ Document `bordereaux` créé dans Firestore
- ✅ Devis mis à jour avec `bordereauId`
- ✅ Status devis: `bordereau_linked`
- ✅ Timeline event ajouté

**Vérification Firestore**:
```javascript
// Collection bordereaux
bordereaux/{bordereauId}
{
  saasAccountId: "...",
  devisId: "...",
  driveFileId: "...",
  driveFileName: "bordereau_abc123xyz.pdf",
  linkedBy: "auto",
  linkMethod: "token",
  ocrStatus: "pending" ou "processing",
  // ... autres champs
}

// Collection quotes
quotes/{devisId}
{
  bordereauId: "{bordereauId}",
  status: "bordereau_linked",
  // ... autres champs
}
```

---

### 5. Recherche automatique bordereau (Email)

**Objectif**: Tester la recherche par Email client

**Étapes**:
1. Créer un nouveau devis via Google Sheet (sans Token dans le nom du bordereau)
2. Uploader un bordereau dans Drive avec l'**email du client** dans le nom
   - Exemple: `bordereau_john.doe.pdf` (où `john.doe@example.com` est l'email)
3. Attendre 90 secondes (polling)
4. Vérifier que le bordereau a été lié

**Résultat attendu**:
- ✅ Bordereau trouvé automatiquement (méthode: `email`)
- ✅ Liaison réussie

---

### 6. Recherche automatique bordereau (Date)

**Objectif**: Tester la recherche par proximité de date

**Étapes**:
1. Créer un nouveau devis via Google Sheet
2. Uploader un bordereau dans Drive **dans les 5 minutes** suivant la soumission Typeform
3. Attendre 90 secondes (polling)
4. Vérifier que le bordereau a été lié

**Résultat attendu**:
- ✅ Bordereau trouvé automatiquement (méthode: `date`)
- ✅ Liaison réussie

---

### 7. OCR automatique

**Objectif**: Vérifier que l'OCR se lance automatiquement après liaison

**Étapes**:
1. Après la liaison d'un bordereau (test 4, 5 ou 6)
2. Attendre 30-60 secondes (temps OCR)
3. Vérifier dans **Firestore** le statut OCR
4. Vérifier que `ocrResult` contient des données

**Résultat attendu**:
- ✅ `ocrStatus`: `pending` → `processing` → `completed`
- ✅ `ocrResult` contient:
  - `lots[]`: Liste des lots extraits
  - `salle_vente`: Nom de la salle des ventes
  - `total`: Total du bordereau
  - `date`: Date de la vente
  - `numero_bordereau`: Numéro du bordereau

**Vérification Firestore**:
```javascript
bordereaux/{bordereauId}
{
  ocrStatus: "completed",
  ocrResult: {
    lots: [
      {
        numero_lot: "42",
        description: "Vase en porcelaine...",
        prix_marteau: 1200
      }
    ],
    salle_vente: "Boisgirard Antonini",
    total: 4700,
    date: "2026-01-15",
    numero_bordereau: "BA-2026-00123"
  },
  ocrCompletedAt: Timestamp,
  // ... autres champs
}
```

---

### 8. Calcul automatique du devis

**Objectif**: Vérifier que le devis est calculé après OCR

**Étapes**:
1. Après l'OCR terminé (test 7)
2. Attendre quelques secondes
3. Vérifier dans **Firestore** que le devis a été mis à jour
4. Vérifier que `status` = `calculated`
5. Vérifier que `totalAmount` est calculé

**Résultat attendu**:
- ✅ `status`: `calculated`
- ✅ `lot.dimensions`: Dimensions extraites
- ✅ `lot.value`: Valeur du bordereau
- ✅ `options.insuranceAmount`: Calculé si demandé (2% de la valeur)
- ✅ `totalAmount`: Total calculé
- ✅ Timeline event "Devis calculé automatiquement"

**Vérification Firestore**:
```javascript
quotes/{devisId}
{
  status: "calculated",
  lot: {
    dimensions: { L: 50, W: 40, H: 30 },
    value: 4700,
    auctionHouse: "Boisgirard Antonini"
  },
  options: {
    insuranceAmount: 94, // 2% de 4700
    packagingPrice: 0, // À implémenter
    shippingPrice: 0 // À implémenter
  },
  totalAmount: 94,
  timeline: [
    // ... événements précédents
    {
      status: "calculated",
      description: "Devis calculé automatiquement (Total: 94€)"
    }
  ]
}
```

---

### 9. Anti-doublon avec uniqueKey

**Objectif**: Vérifier que les doublons sont bien détectés

**Étapes**:
1. Créer un devis via Google Sheet
2. Attendre que le devis soit créé (polling)
3. **Ne pas supprimer** la ligne du Sheet
4. Attendre 90 secondes (nouveau polling)
5. Vérifier qu'**aucun nouveau devis** n'a été créé

**Résultat attendu**:
- ✅ Aucun doublon créé
- ✅ Log dans le terminal: `[Google Sheets Sync] Devis déjà importé (uniqueKey: ...), ignoré`

---

### 10. Isolation multi-tenant

**Objectif**: Vérifier qu'aucune donnée ne fuite entre comptes SaaS

**Étapes**:
1. Créer un **2ème compte SaaS** (se déconnecter et créer un nouveau compte)
2. Connecter Google Sheets + Drive pour ce 2ème compte
3. Créer un devis via Google Sheet du 2ème compte
4. Vérifier que:
   - Le devis du compte 1 n'est **pas visible** dans le compte 2
   - Le bordereau du compte 1 n'est **pas lié** au devis du compte 2
   - Les dossiers Drive sont **séparés**

**Résultat attendu**:
- ✅ Aucune donnée visible entre comptes
- ✅ Bordereaux isolés par `saasAccountId`
- ✅ Devis isolés par `saasAccountId`

---

### 11. Gestion des erreurs

**Objectif**: Vérifier la robustesse du système

**Tests**:

#### A. Bordereau non trouvé
1. Créer un devis via Google Sheet
2. **Ne pas uploader** de bordereau dans Drive
3. Attendre 90 secondes
4. Vérifier que le devis reste en `waiting_for_slip`

**Résultat attendu**:
- ✅ Status: `waiting_for_slip`
- ✅ Pas d'erreur bloquante
- ✅ Log: `[Bordereau Search] ⚠️ Aucun bordereau trouvé pour devis ...`

#### B. OCR échoué
1. Uploader un bordereau **illisible** ou **corrompu**
2. Attendre la liaison + OCR
3. Vérifier que `ocrStatus` = `failed`
4. Vérifier que le devis reste en `waiting_for_slip`

**Résultat attendu**:
- ✅ `ocrStatus`: `failed`
- ✅ `ocrError`: Message d'erreur
- ✅ Devis reste en `waiting_for_slip`

#### C. Token OAuth expiré
1. Attendre que le token Google expire (ou le révoquer manuellement)
2. Attendre le prochain polling
3. Vérifier que Google Sheets/Drive est déconnecté automatiquement

**Résultat attendu**:
- ✅ Déconnexion automatique
- ✅ `integrations.googleSheets.connected`: `false`

---

### 12. Interface utilisateur

**Objectif**: Vérifier l'affichage dans l'UI

**Étapes**:
1. Aller dans **Paramètres** → **Google Drive**
2. Vérifier l'affichage du statut
3. Tester la déconnexion
4. Tester la reconnexion
5. Vérifier que les loaders s'affichent pendant les chargements

**Résultat attendu**:
- ✅ Statut affiché correctement
- ✅ Nom du dossier affiché
- ✅ Date de connexion affichée
- ✅ Boutons fonctionnels
- ✅ Loaders pendant les actions

---

## 📊 Checklist finale

- [ ] OAuth Google Sheets + Drive
- [ ] Sélection dossier Drive
- [ ] Import Sheet avec includeGridData
- [ ] Recherche bordereau (Token)
- [ ] Recherche bordereau (Email)
- [ ] Recherche bordereau (Date)
- [ ] OCR automatique
- [ ] Calcul automatique
- [ ] Anti-doublon
- [ ] Isolation multi-tenant
- [ ] Gestion erreurs (bordereau non trouvé)
- [ ] Gestion erreurs (OCR échoué)
- [ ] Interface utilisateur

---

## 🐛 Bugs potentiels à surveiller

### 1. Firestore Index manquant
**Symptôme**: Erreur `9 FAILED_PRECONDITION: The query requires an index`  
**Solution**: Créer l'index composite (voir `FIRESTORE_INDEX_SETUP.md`)

### 2. Token OAuth expiré
**Symptôme**: Erreur 401 lors du polling  
**Solution**: Déconnexion/reconnexion Google Sheets

### 3. Bordereau trop volumineux
**Symptôme**: Timeout OCR  
**Solution**: Limiter la taille des fichiers (10 MB max)

### 4. Plusieurs bordereaux trouvés
**Symptôme**: Mauvais bordereau lié  
**Solution**: Améliorer le nommage des fichiers (inclure Token)

---

## 📝 Rapport de test

**Date**: ___________  
**Testeur**: ___________  
**Version**: 1.5.0

### Tests réussis
- [ ] Test 1: OAuth Google Sheets + Drive
- [ ] Test 2: Sélection dossier Drive
- [ ] Test 3: Import Sheet
- [ ] Test 4: Recherche Token
- [ ] Test 5: Recherche Email
- [ ] Test 6: Recherche Date
- [ ] Test 7: OCR automatique
- [ ] Test 8: Calcul automatique
- [ ] Test 9: Anti-doublon
- [ ] Test 10: Isolation multi-tenant
- [ ] Test 11: Gestion erreurs
- [ ] Test 12: Interface utilisateur

### Tests échoués
- [ ] Aucun

### Bugs trouvés
1. ___________
2. ___________

### Commentaires
___________

---

## ✅ Validation finale

Si tous les tests passent:
- ✅ Le système est **prêt pour la production**
- ✅ Le workflow complet est **fonctionnel**
- ✅ L'isolation multi-tenant est **sécurisée**
- ✅ La gestion des erreurs est **robuste**

**Prochaines étapes**:
1. Push sur GitHub
2. Déploiement production
3. Formation utilisateurs
4. Monitoring des premiers usages

---

**Bon test ! 🚀**

