# 🎨 Nouvelle Interface Grille Tarifaire - Version 2.0

## 📋 Vue d'ensemble

La nouvelle interface de la grille tarifaire d'expédition est inspirée du projet **shipping-rate-builder** et offre une expérience utilisateur moderne et intuitive.

## ✨ Caractéristiques principales

### 1. **Interface en Accordéon**
- Chaque zone est une carte qui peut être **expand/collapse**
- Design moderne avec badges colorés par zone (A, B, C, etc.)
- Sticky header pour garder les actions toujours visibles

### 2. **Édition Inline**
- Cliquez directement sur une cellule pour modifier le prix
- Tapez "NA" ou laissez vide pour marquer un service comme non disponible
- Appuyez sur `Enter` pour sauvegarder, `Escape` pour annuler

### 3. **Gestion Dynamique**
- **Ajouter/Supprimer des services** : Directement dans chaque zone
- **Ajouter/Supprimer des tranches de poids** : Avec les boutons `+` et `X`
- **Modifier les noms** : Cliquez sur le nom de la zone ou des pays pour éditer

### 4. **Actions Globales**
- **Sauvegarder** : Enregistre toutes les modifications en une fois
- **Exporter** : Télécharge la grille en JSON
- **Réinitialiser** : Restaure les valeurs par défaut
- **Nouvelle zone** : Crée une nouvelle zone géographique
- **Tout développer/réduire** : Toggle toutes les zones en un clic

## 🎨 Design

### Badges de Zones Colorés
Chaque zone a une couleur distinctive :
- **Zone A** : Bleu (France)
- **Zone B** : Violet (Europe Proche)
- **Zone C** : Vert (Europe Étendue)
- **Zone D** : Jaune (Europe Hors UE)
- **Zone E** : Rouge (Amérique du Nord)
- **Zone F** : Rose (Asie)
- **Zone G** : Orange (Amérique du Sud)
- **Zone H** : Teal (Afrique)

### Cellules Éditables
- **Hover** : Fond gris clair
- **NA** : Fond gris avec texte italique
- **Focus** : Ring bleu autour de la cellule

## 🔧 Architecture Technique

### Structure de Données

```typescript
interface ShippingZoneUI {
  id: string;
  code: string; // "A", "B", "C", etc.
  name: string; // "France", "Europe Proche", etc.
  countries: string; // "FR, BE, LU, DE"
  weightBrackets: number[]; // [1, 2, 5, 10, 15, 20, 30]
  services: ServiceRate[];
  isExpanded: boolean;
}

interface ServiceRate {
  serviceName: string; // "STANDARD", "EXPRESS"
  serviceId: string;
  rates: (number | null)[]; // null = NA
}
```

### Composants

1. **ShippingRatesSettings.tsx** : Composant principal
   - Gère l'état global de la grille
   - Synchronise avec Firestore
   - Gère les actions (sauvegarder, exporter, etc.)

2. **ZoneCard.tsx** : Carte pour chaque zone
   - Affiche le tableau des tarifs
   - Gère l'édition des services et tranches de poids
   - Permet la suppression de la zone

3. **EditableCell.tsx** : Cellule éditable
   - Gère l'édition inline des prix
   - Supporte "NA" pour les services non disponibles
   - Validation des entrées

4. **AddZoneDialog.tsx** : Dialog pour créer une zone
   - Formulaire avec code, nom et pays
   - Crée automatiquement les services par défaut
   - Intégration avec Firestore

## 📊 Workflow Utilisateur

### 1. Initialisation
Si la grille n'est pas initialisée :
- Message d'alerte avec le nombre de zones/services détectés
- Bouton "Initialiser la grille tarifaire"
- Crée automatiquement les données par défaut

### 2. Édition
1. Cliquez sur une zone pour l'ouvrir
2. Cliquez sur une cellule pour modifier le prix
3. Modifiez les noms de zones/services en cliquant dessus
4. Ajoutez/supprimez des services et tranches de poids
5. Cliquez sur "Sauvegarder" pour enregistrer

### 3. Gestion des Zones
- **Créer** : Bouton "Nouvelle zone" dans le header
- **Modifier** : Cliquez sur le nom ou les pays
- **Supprimer** : Icône poubelle dans chaque carte
- **Réorganiser** : Drag & drop (icône grip)

## 🚀 Avantages

### Par rapport à l'ancienne interface :
- ✅ **Plus intuitive** : Format accordéon vs grille Excel complexe
- ✅ **Plus rapide** : Édition inline sans dialogs
- ✅ **Plus flexible** : Ajout/suppression dynamique
- ✅ **Plus moderne** : Design avec badges colorés et animations
- ✅ **Plus accessible** : Toutes les zones visibles d'un coup d'œil

## 🔄 Synchronisation avec Firestore

### Lecture
- Les données sont chargées depuis 4 collections :
  - `shippingZones`
  - `shippingServices`
  - `weightBrackets`
  - `shippingRates`
- Transformation en format UI pour l'affichage

### Écriture
- Sauvegarde en batch de toutes les modifications
- Mise à jour des zones, services et rates
- Gestion des erreurs avec toasts

## 📝 Notes Importantes

1. **Isolation SaaS** : Chaque client a sa propre grille
2. **Validation** : Les prix doivent être ≥ 0
3. **NA** : Utilisez "NA" ou laissez vide pour les services non disponibles
4. **Ordre** : Les zones sont triées par leur champ `order`
5. **Actif/Inactif** : Seules les zones actives sont affichées

## 🎯 Prochaines Étapes

1. ✅ Implémenter la nouvelle interface
2. ✅ Ajouter les styles CSS pour les badges
3. ✅ Créer les composants ZoneCard, EditableCell, AddZoneDialog
4. ⏳ Adapter la logique de calcul dans `calculateDevisFromOCR`
5. ⏳ Tests utilisateur
6. ⏳ Documentation utilisateur finale

---

**Date de création** : 22 janvier 2026  
**Version** : 2.0  
**Statut** : ✅ Implémenté

