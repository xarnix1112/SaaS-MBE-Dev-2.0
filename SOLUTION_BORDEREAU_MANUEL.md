# 🔧 Solution: Lier manuellement un bordereau à un devis existant

## 📋 Contexte

Le devis `cUv3PnPlmPtqBp9OREOc` (Aurelie Brault) a été créé **AVANT** que la correction de recherche de bordereau soit implémentée.

Le bordereau "Test SaaS SDV" existe bien dans le dossier Google Drive mais n'a pas été lié automatiquement.

---

## ✅ Solution implémentée

Une nouvelle route API a été créée pour **forcer manuellement** la recherche de bordereau pour un devis existant.

### Route API

```
POST /api/devis/:id/search-bordereau
Authorization: Bearer <firebase_token>
```

### Fonctionnalités

- ✅ Protégée par `requireAuth` (isolation SaaS)
- ✅ Vérifications complètes
  - Devis existe et appartient au bon `saasAccountId`
  - Google Sheets/Drive connectés
  - Token OAuth valide (rafraîchissement auto si expiré)
- ✅ Utilise les **nouvelles stratégies de recherche améliorées**
  - ID Drive direct (si disponible)
  - **Nom de fichier** (NEW - devrait fonctionner pour "Test SaaS SDV")
  - Token Typeform
  - Email client
  - Proximité de date
- ✅ Retourne `bordereauId` si trouvé, ou message explicite sinon
- ✅ Déclenche automatiquement l'OCR après liaison
- ✅ Met à jour la timeline du devis

---

## 🧪 Test manuel dans la console du navigateur

### Étape 1 : Obtenir le Firebase token

Ouvre la console JavaScript de ton navigateur (F12) et copie-colle :

```javascript
// Obtenir le token Firebase
import { auth } from './src/lib/firebase';
const token = await auth.currentUser.getIdToken();
console.log('Token:', token);
// Copie le token affiché
```

### Étape 2 : Appeler l'API

Remplace `<TON_TOKEN>` par le token copié à l'étape 1 :

```javascript
const response = await fetch('http://localhost:5174/api/devis/cUv3PnPlmPtqBp9OREOc/search-bordereau', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer <TON_TOKEN>',
    'Content-Type': 'application/json'
  }
});

const result = await response.json();
console.log('Résultat:', result);
```

### Réponses attendues

**✅ Succès** :
```json
{
  "success": true,
  "message": "Bordereau trouvé et lié avec succès",
  "bordereauId": "abc123..."
}
```

**⚠️ Non trouvé** :
```json
{
  "success": false,
  "message": "Aucun bordereau correspondant trouvé dans le dossier Google Drive"
}
```

**❌ Erreur** :
```json
{
  "error": "Google Sheets non connecté (nécessaire pour accéder à Drive)"
}
```

---

## 📊 Vérifier le résultat

### Dans le terminal backend

Tu devrais voir ces logs :

```
[API] 🔍 Recherche manuelle de bordereau pour devis cUv3PnPlmPtqBp9OREOc
[Bordereau Search] Recherche par nom de fichier: "Test SaaS SDV"
[Bordereau Search] ✅ Bordereau trouvé via filename: Test SaaS SDV.pdf
[Bordereau Link] ✅ Bordereau Test SaaS SDV.pdf lié au devis cUv3PnPlmPtqBp9OREOc
[OCR] Démarrage OCR pour bordereau ...
[API] ✅ Bordereau trouvé et lié pour devis cUv3PnPlmPtqBp9OREOc
```

### Dans l'interface

1. **Rafraîchir le devis** (F5 ou cliquer à nouveau sur "Voir détails")
2. **Vérifier l'onglet "Bordereau"** :
   - Le fichier devrait apparaître
   - Nom : "Test SaaS SDV.pdf"
   - Statut : "OCR en cours" ou "OCR terminé"
3. **Vérifier la timeline** :
   - Nouvelle entrée : "Bordereau lié automatiquement (méthode: filename)"

---

## 🔄 Workflow complet (si le bordereau n'est toujours pas trouvé)

Si même après avoir appelé l'API le bordereau n'est pas trouvé, voici les vérifications :

### 1. Vérifier le nom exact du fichier dans Drive

Le nom doit être proche de : `Test SaaS SDV`

Variations acceptées :
- "Test_SaaS_SDV.pdf"
- "test saas sdv.pdf"
- "TestSaaSSdv.pdf"

### 2. Vérifier que le fichier est bien dans le bon dossier

- Va dans Google Drive
- Vérifie que le dossier sélectionné dans Paramètres est le bon
- Vérifie que le fichier est bien à la racine du dossier (pas dans un sous-dossier)

### 3. Re-tester avec le bon dossier

Si le fichier n'est pas dans le bon dossier :
1. Va dans **Paramètres** → **Google Drive**
2. Déconnecte
3. Reconnecte
4. Sélectionne le **bon dossier**
5. Relance l'API manuelle

---

## 🚀 Solution future : Bouton dans l'interface

Pour les prochaines versions, je recommande d'ajouter un bouton "Rechercher bordereau" dans l'interface, qui appelle cette API automatiquement.

**Position suggérée** : Onglet "Bordereau" du devis, section "Aucun bordereau lié"

```typescript
const handleSearchBordereau = async () => {
  setIsSearching(true);
  try {
    const token = await auth.currentUser?.getIdToken();
    const response = await fetch(`/api/devis/${quoteId}/search-bordereau`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    const result = await response.json();
    
    if (result.success) {
      toast.success('Bordereau trouvé et lié !');
      queryClient.invalidateQueries(['quote', quoteId]);
    } else {
      toast.warning(result.message);
    }
  } catch (error) {
    toast.error('Erreur lors de la recherche');
  } finally {
    setIsSearching(false);
  }
};
```

---

## 📝 Commits

- `631b1dd`: feat(bordereaux): API manuelle recherche bordereau + fix retour valeur
- `de3ad48`: feat(bordereaux): Route API manuelle recherche bordereau

Version: **1.5.2 (Hotfix)**

