# 🔄 Script de Re-calcul d'un Devis

## 📋 Contexte

Ce script permet de **re-calculer un devis existant** à partir de son bordereau OCR déjà traité.

**Cas d'usage** : Un devis a été créé AVANT la correction du mapping `auctionSheet`, donc les données OCR ne sont pas correctement copiées dans le document `quotes`.

---

## 🚀 Utilisation

### Étape 1 : Ouvrir la Console du Navigateur

1. Ouvrez l'application dans votre navigateur
2. Appuyez sur `F12` (ou `Cmd+Option+I` sur Mac)
3. Allez dans l'onglet **Console**

### Étape 2 : Exécuter le Script

Copiez-collez ce code dans la console et appuyez sur `Entrée` :

```javascript
// 🔄 Script de re-calcul d'un devis
(async function recalculateQuote() {
  try {
    // 1. Récupérer l'ID du devis depuis l'URL
    const url = window.location.href;
    const match = url.match(/\/devis\/([^\/]+)/);
    
    if (!match) {
      console.error('❌ Impossible de trouver l\'ID du devis dans l\'URL');
      console.log('💡 Assurez-vous d\'être sur la page de détail d\'un devis (ex: /devis/ABC123)');
      return;
    }
    
    const devisId = match[1];
    console.log(`🔍 ID du devis détecté: ${devisId}`);
    
    // 2. Récupérer le token Firebase
    const { auth } = await import('/src/lib/firebase.js');
    const user = auth.currentUser;
    
    if (!user) {
      console.error('❌ Vous devez être connecté');
      return;
    }
    
    const token = await user.getIdToken();
    console.log('✅ Token Firebase récupéré');
    
    // 3. Appeler l'API de re-calcul
    console.log('🔄 Re-calcul du devis en cours...');
    const response = await fetch(`/api/devis/${devisId}/recalculate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      const error = await response.json();
      console.error('❌ Erreur:', error.error || 'Erreur inconnue');
      return;
    }
    
    const result = await response.json();
    console.log('✅ Devis re-calculé avec succès!');
    console.log('📊 Résultat:', result);
    
    // 4. Recharger la page pour voir les changements
    console.log('🔄 Rechargement de la page dans 2 secondes...');
    setTimeout(() => {
      window.location.reload();
    }, 2000);
    
  } catch (error) {
    console.error('❌ Erreur lors du re-calcul:', error);
  }
})();
```

### Étape 3 : Vérifier le Résultat

Après le rechargement de la page, vérifiez que :
- ✅ Le **numéro de bordereau** est maintenant affiché
- ✅ La **valeur déclarée** est maintenant affichée

---

## 🔧 Version Simplifiée (avec ID manuel)

Si le script automatique ne fonctionne pas, utilisez cette version en remplaçant `VOTRE_ID_DEVIS` :

```javascript
// 🔄 Script de re-calcul d'un devis (version manuelle)
(async function() {
  const devisId = 'FlSy6HIavmpMzbYiYfTR'; // ⚠️ REMPLACEZ PAR L'ID DE VOTRE DEVIS
  
  try {
    const { auth } = await import('/src/lib/firebase.js');
    const token = await auth.currentUser.getIdToken();
    
    const response = await fetch(`/api/devis/${devisId}/recalculate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
    
    const result = await response.json();
    console.log('✅ Résultat:', result);
    
    setTimeout(() => window.location.reload(), 2000);
  } catch (error) {
    console.error('❌ Erreur:', error);
  }
})();
```

---

## 📊 Exemple de Résultat Attendu

### Console du Navigateur

```
🔍 ID du devis détecté: FlSy6HIavmpMzbYiYfTR
✅ Token Firebase récupéré
🔄 Re-calcul du devis en cours...
✅ Devis re-calculé avec succès!
📊 Résultat: {
  success: true,
  message: "Devis re-calculé avec succès",
  devisId: "FlSy6HIavmpMzbYiYfTR"
}
🔄 Rechargement de la page dans 2 secondes...
```

### Terminal Backend

```
[API] 🔄 Re-calcul du devis FlSy6HIavmpMzbYiYfTR
[Calcul] ✅ Devis FlSy6HIavmpMzbYiYfTR calculé: 77€, 1 lots extraits
[API] ✅ Devis FlSy6HIavmpMzbYiYfTR re-calculé avec succès
```

---

## 🐛 Dépannage

### Erreur : "Impossible de trouver l'ID du devis"
- **Cause** : Vous n'êtes pas sur la page de détail d'un devis
- **Solution** : Allez sur `/devis/VOTRE_ID` avant d'exécuter le script

### Erreur : "Vous devez être connecté"
- **Cause** : Vous n'êtes pas authentifié
- **Solution** : Connectez-vous à l'application avant d'exécuter le script

### Erreur : "Aucun bordereau lié à ce devis"
- **Cause** : Le devis n'a pas de bordereau attaché
- **Solution** : Attachez d'abord un bordereau au devis

### Erreur : "OCR non terminé pour ce bordereau"
- **Cause** : L'OCR est en cours ou a échoué
- **Solution** : Attendez que l'OCR soit terminé (status = "completed")

---

## 🔍 Vérification Firestore

### Avant le Re-calcul

```javascript
// Document: quotes/FlSy6HIavmpMzbYiYfTR
{
  auctionSheet: {
    salleVente: "Boisgirard Antonini",      // ❌ Ancien nom
    numeroBordereau: "32320",                // ❌ Ancien nom
    lots: [...]
  }
}
```

### Après le Re-calcul

```javascript
// Document: quotes/FlSy6HIavmpMzbYiYfTR
{
  auctionSheet: {
    auctionHouse: "Boisgirard Antonini",    // ✅ Nouveau nom
    bordereauNumber: "32320",                // ✅ Nouveau nom
    date: "2025-11-27",
    totalValue: 77,
    lots: [
      {
        lotNumber: null,
        description: "[ANESTHESIE] DUMONT...",
        value: 60,                            // ✅ Prix marteau
        total: 77                             // ✅ Prix avec frais
      }
    ]
  }
}
```

---

## ✅ Résultat Final

Après le re-calcul, la page "Informations du lot" devrait afficher :

```
┌─────────────────────────────────────────┐
│ Informations du lot                     │
├─────────────────────────────────────────┤
│ Salle des ventes: Boisgirard Antonini  │ ✅
│ Bordereau: 32320                        │ ✅
├─────────────────────────────────────────┤
│ 1 lot détecté                           │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ Lot Non détecté par OCR             │ │
│ │ Valeur déclarée: 77.00€             │ ✅
│ │ Description: [ANESTHESIE] DUMONT... │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

---

## 📝 Note

Ce script est **temporaire** et ne sera nécessaire que pour les devis créés **avant** la correction du mapping `auctionSheet`.

Tous les **nouveaux devis** créés après la correction auront automatiquement les bonnes données.

