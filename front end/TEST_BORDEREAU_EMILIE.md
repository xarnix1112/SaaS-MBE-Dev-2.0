# Test Manuel: Recherche Bordereau pour Emilie EL-Haimer

## 📋 Informations du devis
- **ID Devis**: `msVBBBWcYViAtdGQHMNf`
- **Client**: Emilie EL-Haimer
- **Email**: 1clementbrault@gmail.com
- **Token Typeform**: `ljfh2u4zeqhqljfhl109vjppis2h1zcx`
- **Date soumission**: 19/01/2026 13:59:22
- **Lien Typeform**: `https://api.typeform.com/responses/files/aaae3d0857747a66345e918f88a084c39df78bb6e6aa79ab3c7fa3235c95fb9c/BORDEREAU_ACQUEREUR_N°_32320_HALBON_Pierre_Yvan.pdf`
- **Fichier Drive**: `ca0936feeca3-BORDEREAU_ACQUEREUR_N°_32320_HALBON_Pierre_Yvan.pdf`

## 🔧 Améliorations apportées

### 1. Recherche par nom de fichier améliorée
- **Avant**: Cherchait `BORDEREAU_ACQUEREUR_N°_32320_HALBON_Pierre_Yvan`
- **Après**: Enlève le préfixe hash (`ca0936feeca3-`) et cherche `BORDEREAU ACQUEREUR 32320 HALBON Pierre`
- **Regex ajoutée**: `/^[a-f0-9]{12,16}-/i` pour détecter et enlever les préfixes Typeform

### 2. Recherche par date étendue
- **Avant**: ± 5 minutes
- **Après**: ± 10 minutes (plus de tolérance pour les décalages de synchronisation)

### 3. Plus de mots-clés
- **Avant**: 3 mots maximum
- **Après**: 5 mots pour plus de précision

## 🧪 Script de test à exécuter dans la console du navigateur

```javascript
(async () => {
  try {
    console.log('🔑 Récupération du token Firebase...');
    
    // Importer auth depuis le module Firebase
    const { auth } = await import('./src/lib/firebase');
    const { getIdToken } = await import('firebase/auth');
    
    const currentUser = auth.currentUser;
    if (!currentUser) {
      console.error('❌ Aucun utilisateur connecté');
      return;
    }
    
    const token = await getIdToken(currentUser);
    console.log('✅ Token obtenu');

    console.log('🔍 Recherche du bordereau pour Emilie EL-Haimer...');
    const response = await fetch('http://localhost:5174/api/devis/msVBBBWcYViAtdGQHMNf/search-bordereau', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const result = await response.json();
    console.log('📊 Résultat:', result);

    if (result.success) {
      console.log('✅ SUCCÈS ! Bordereau trouvé et lié');
      console.log('🆔 Bordereau ID:', result.bordereauId);
      console.log('👉 Rafraîchis la page (F5) pour voir le bordereau');
    } else {
      console.log('⚠️  Non trouvé:', result.message);
      console.log('💡 Vérifie:');
      console.log('   1. Le fichier existe dans Google Drive: ca0936feeca3-BORDEREAU_ACQUEREUR_N°_32320_HALBON_Pierre_Yvan.pdf');
      console.log('   2. Le dossier Google Drive est bien configuré dans les Paramètres');
      console.log('   3. Les logs du terminal pour plus de détails');
    }
  } catch (error) {
    console.error('❌ Erreur:', error);
  }
})();
```

## 📝 Logs attendus dans le terminal

Si la recherche fonctionne, tu devrais voir dans le terminal :

```
[Bordereau Search] Recherche par nom de fichier: "BORDEREAU ACQUEREUR 32320 HALBON Pierre" (original: "BORDEREAU_ACQUEREUR_N°_32320_HALBON_Pierre_Yvan.pdf")
[Bordereau Search] ✅ Bordereau trouvé via filename: ca0936feeca3-BORDEREAU_ACQUEREUR_N°_32320_HALBON_Pierre_Yvan.pdf
[API] ✅ Bordereau trouvé et lié pour devis msVBBBWcYViAtdGQHMNf
```

## 🎯 Résultat attendu

1. Le bordereau est trouvé dans Google Drive
2. Un document `bordereau` est créé dans Firestore
3. Le devis est mis à jour avec `bordereauId`
4. L'OCR est lancé automatiquement
5. Le statut du devis passe à `waiting_for_ocr`

## 🔄 Si ça ne fonctionne toujours pas

### Vérifications à faire:

1. **Fichier existe dans Drive**
   ```
   Nom: ca0936feeca3-BORDEREAU_ACQUEREUR_N°_32320_HALBON_Pierre_Yvan.pdf
   Dossier: Test SaaS SDV
   ```

2. **Dossier configuré dans Paramètres**
   - Aller dans Paramètres > Google Drive
   - Vérifier que le dossier "Test SaaS SDV" est sélectionné

3. **Logs détaillés**
   - Regarder le terminal pour voir quelle stratégie de recherche a été utilisée
   - Vérifier s'il y a des erreurs d'accès à Google Drive

4. **Données du devis**
   - Vérifier dans Firestore que le devis a bien les champs:
     - `bordereauFileName`
     - `typeformToken`
     - `typeformSubmittedAt`

## 🛠️ Debugging avancé

Si le script échoue, exécute ce script pour voir les données du devis :

```javascript
(async () => {
  const { auth } = await import('./src/lib/firebase');
  const { getIdToken } = await import('firebase/auth');
  const token = await getIdToken(auth.currentUser);
  
  const response = await fetch('http://localhost:5174/api/quotes', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  const quotes = await response.json();
  const emilie = quotes.find(q => q.id === 'msVBBBWcYViAtdGQHMNf');
  
  console.log('📋 Données du devis Emilie:', {
    id: emilie.id,
    bordereauFileName: emilie.bordereauFileName,
    typeformToken: emilie.typeformToken,
    typeformSubmittedAt: emilie.typeformSubmittedAt,
    driveFileIdFromLink: emilie.driveFileIdFromLink,
    clientEmail: emilie.client?.email
  });
})();
```

## ✅ Checklist finale

- [ ] Les 32 erreurs TypeScript sont corrigées
- [ ] La logique de recherche de bordereau est améliorée
- [ ] Le script de test est prêt
- [ ] Redémarrer le serveur pour appliquer les changements
- [ ] Exécuter le script de test dans la console
- [ ] Vérifier les logs du terminal
- [ ] Rafraîchir la page pour voir le bordereau

