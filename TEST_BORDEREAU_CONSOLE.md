# 🧪 Script Test Bordereau - Console Navigateur

## 📋 Informations du bordereau

- **Dossier Google Drive** : `Test SaaS SDV`
- **Fichier bordereau** : `0abdcf570976-bordereau_acheteur_dong_chenyi_AV_260_025_rel.pdf`
- **Devis ID** : `cUv3PnPlmPtqBp9OREOc`
- **Client** : Aurelie Brault (Email: dong.chenyi68@gmail.com)

---

## ✅ Script JavaScript correct (copie-colle dans la console)

**Ouvre la console JavaScript (F12) et copie-colle ce code** :

```javascript
// Import Firebase auth
import { auth } from './src/lib/firebase';

// Fonction async pour tester
(async () => {
  try {
    // 1. Obtenir le token Firebase
    console.log('🔑 Récupération du token Firebase...');
    const token = await auth.currentUser.getIdToken();
    console.log('✅ Token obtenu');

    // 2. Appeler l'API de recherche de bordereau
    console.log('🔍 Recherche du bordereau pour le devis cUv3PnPlmPtqBp9OREOc...');
    const response = await fetch('http://localhost:5174/api/devis/cUv3PnPlmPtqBp9OREOc/search-bordereau', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    // 3. Afficher le résultat
    const result = await response.json();
    console.log('📊 Résultat de la recherche:', result);

    if (result.success) {
      console.log('✅ SUCCÈS ! Bordereau trouvé et lié');
      console.log('📄 ID du bordereau:', result.bordereauId);
      console.log('👉 Rafraîchis la page (F5) pour voir le bordereau dans le devis');
    } else {
      console.log('⚠️  Aucun bordereau trouvé');
      console.log('💡 Message:', result.message);
    }
  } catch (error) {
    console.error('❌ Erreur:', error);
  }
})();
```

---

## 📊 Résultats attendus

### ✅ Si le bordereau est trouvé

**Dans la console navigateur** :
```
🔑 Récupération du token Firebase...
✅ Token obtenu
🔍 Recherche du bordereau pour le devis cUv3PnPlmPtqBp9OREOc...
📊 Résultat de la recherche: {success: true, message: "Bordereau trouvé et lié avec succès", bordereauId: "abc123..."}
✅ SUCCÈS ! Bordereau trouvé et lié
📄 ID du bordereau: abc123...
👉 Rafraîchis la page (F5) pour voir le bordereau dans le devis
```

**Dans le terminal backend** :
```
[API] 🔍 Recherche manuelle de bordereau pour devis cUv3PnPlmPtqBp9OREOc
[Bordereau Search] Recherche par nom de fichier: "bordereau acheteur dong chenyi"
[Bordereau Search] ✅ Bordereau trouvé via filename: 0abdcf570976-bordereau_acheteur_dong_chenyi_AV_260_025_rel.pdf
[Bordereau Link] ✅ Bordereau lié au devis cUv3PnPlmPtqBp9OREOc
[OCR] Démarrage OCR pour bordereau ...
[API] ✅ Bordereau trouvé et lié pour devis cUv3PnPlmPtqBp9OREOc
```

### ⚠️ Si le bordereau n'est pas trouvé

**Dans la console** :
```
⚠️  Aucun bordereau trouvé
💡 Message: Aucun bordereau correspondant trouvé dans le dossier Google Drive
```

**Causes possibles** :
1. Le fichier n'est pas dans le bon dossier Google Drive
2. Le nom du fichier ne correspond à aucun critère de recherche
3. Les tokens Google ont expiré

---

## 🔧 Si ça ne fonctionne pas

### Option 1 : Vérifier le dossier Google Drive

1. Va dans **Paramètres** → **Google Drive**
2. Vérifie que le dossier sélectionné est : `Test SaaS SDV`
3. Si ce n'est pas le bon, **Déconnecte** puis **Reconnecte**
4. Sélectionne le bon dossier
5. Relance le script

### Option 2 : Vérifier que le fichier est dans le bon dossier

1. Ouvre Google Drive dans ton navigateur
2. Trouve le dossier `Test SaaS SDV`
3. Vérifie que le fichier `0abdcf570976-bordereau_acheteur_dong_chenyi_AV_260_025_rel.pdf` est bien dedans
4. Si le fichier est dans un sous-dossier, **déplace-le à la racine** du dossier `Test SaaS SDV`

### Option 3 : Forcer la resynchronisation

Dans la console, copie-colle :

```javascript
import { auth } from './src/lib/firebase';

(async () => {
  const token = await auth.currentUser.getIdToken();
  const response = await fetch('http://localhost:5174/api/google-sheets/resync', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  const result = await response.json();
  console.log('Resync:', result);
})();
```

Attends 10 secondes, puis relance le script de recherche de bordereau.

---

## 📝 Notes importantes

- Le script **NE fonctionne QUE dans la console du navigateur**, pas dans le terminal
- Tu dois être **connecté** à l'application
- Tu dois être **sur la page du devis** ou n'importe quelle page de l'application
- Après un succès, **rafraîchis la page** (F5) pour voir le bordereau

---

## 🚀 Après le test

Si le bordereau est trouvé et lié avec succès :

1. **Rafraîchis la page** du devis (F5)
2. **Va dans l'onglet "Bordereau"**
3. Tu devrais voir :
   - Nom du fichier
   - Statut OCR
   - Bouton "Voir le bordereau"
4. **L'OCR se lance automatiquement** en arrière-plan
5. **Le calcul de prix** se lancera après l'OCR

---

## 📞 Besoin d'aide ?

Si ça ne fonctionne toujours pas, donne-moi :

1. **Le résultat dans la console navigateur** (copie-colle tout)
2. **Le log du terminal backend** (les 20 dernières lignes après avoir lancé le script)
3. **Confirmation** que le fichier est bien dans le bon dossier Google Drive

