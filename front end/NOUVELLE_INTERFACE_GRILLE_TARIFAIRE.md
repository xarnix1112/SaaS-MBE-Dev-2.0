# 🎨 Nouvelle Interface Grille Tarifaire - Type Excel

## 📋 Vue d'ensemble

L'interface de la grille tarifaire a été **complètement redessinée** pour être **intuitive et facile à utiliser**, inspirée de votre grille Excel.

---

## ✨ Nouveautés

### 1️⃣ **Interface simplifiée - Tout en un seul écran**

- ✅ **Toutes les zones visibles** en une seule page (plus besoin de naviguer entre onglets)
- ✅ **Format Excel** : Colonnes = poids, Lignes = services
- ✅ **Édition directe** : Cliquez sur une cellule pour modifier le prix
- ✅ **Validation rapide** : Entrée pour valider, Échap pour annuler

### 2️⃣ **Affichage type Excel**

```
ZONE A – FRANCE (FR)
Service \ Poids (kg)    1    2    5    10   15   20   30
STANDARD                6    7    9    14   18   22   30
EXPRESS                 9    11   14   19   25   30   40

ZONE B – EUROPE PROCHE (BE, LU, DE, NL, ES, IT)
Service \ Poids (kg)    1    2    5    10   15   20   30
STANDARD                8    10   14   22   28   35   48
EXPRESS                 12   15   20   30   38   48   65
```

### 3️⃣ **Édition inline ultra-simple**

1. **Cliquer** sur une cellule
2. **Saisir** le prix (ex: 12.50)
3. **Entrée** pour valider ou **Échap** pour annuler
4. **0 ou vide** = Service non disponible (N/A)

### 4️⃣ **Codes couleurs intuitifs**

- 🟦 **Cellule blanche** : Prix défini, cliquez pour modifier
- 🟨 **Cellule grise** : N/A (service non disponible)
- 🟩 **Cellule bleue** : En cours d'édition
- 🟪 **Survol bleu clair** : Cellule survolée

### 5️⃣ **Options avancées masquées**

- ✅ Bouton **"Options avancées"** pour accéder aux réglages
- ✅ Gestion des zones, services et paramètres
- ✅ Interface principale reste épurée

---

## 🎯 Workflow utilisateur

### Étape 1 : Accéder à la grille

```
Paramètres → Onglet "Expédition"
```

### Étape 2 : Lire les instructions

Une zone d'aide s'affiche en haut :
- Comment remplir la grille
- Raccourcis clavier
- Exemple concret

### Étape 3 : Remplir la grille

Pour chaque zone (A, B, C, etc.) :
1. Cliquer sur une cellule (ex: Zone A / STANDARD / 5kg)
2. Saisir le prix (ex: 9)
3. Appuyer sur Entrée
4. Passer à la cellule suivante

### Étape 4 : Marquer services non disponibles

Pour marquer un service comme "N/A" :
- Saisir **0** ou laisser **vide**
- Exemple : Zone E / STANDARD = N/A (saisir 0)

### Étape 5 : Ajuster les paramètres (optionnel)

Cliquer sur **"Options avancées"** pour :
- Ajouter/modifier des zones
- Ajouter/modifier des services
- Configurer le forfait hors gabarit

---

## 📊 Comparaison Avant/Après

### ❌ Avant (Version complexe)

```
1. Onglet "Zones" → Créer zones
2. Onglet "Services" → Créer services
3. Onglet "Grille tarifaire" → Remplir cellule par cellule
4. Navigation entre 4 onglets
5. Interface peu intuitive
```

### ✅ Après (Version simplifiée)

```
1. Page unique avec toutes les zones
2. Cliquer sur cellule → Saisir prix → Entrée
3. Format Excel familier
4. Options avancées masquées par défaut
5. Interface intuitive et rapide
```

---

## 🔧 Fonctionnalités techniques

### Édition inline

```typescript
// Clic sur cellule
onClick={() => handleCellClick(zoneId, serviceId, weightBracketId)}

// Validation
onKeyDown={(e) => {
  if (e.key === 'Enter') handleSaveCell();
  if (e.key === 'Escape') handleCancelEdit();
}}

// Sauvegarde automatique au blur
onBlur={handleSaveCell}
```

### Gestion N/A

```typescript
// Prix = 0 ou null → Affiche "N/A"
const displayValue = price > 0 ? `${price.toFixed(0)}` : "N/A";

// Cellule grise pour N/A
className={cn(
  price === null || price === 0
    ? "bg-gray-100 dark:bg-gray-800"
    : "bg-white dark:bg-background"
)}
```

### Tri des zones

```typescript
// Tri par ordre (champ order)
const sortedZones = [...zones]
  .filter((z) => z.isActive)
  .sort((a, b) => (a.order || 999) - (b.order || 999));
```

---

## 🎨 Design System

### Couleurs

- **Cellule normale** : `bg-white dark:bg-background`
- **Cellule N/A** : `bg-gray-100 dark:bg-gray-800`
- **Cellule en édition** : `bg-blue-100 dark:bg-blue-900 ring-2 ring-blue-500`
- **Survol** : `hover:bg-blue-50 dark:hover:bg-blue-950`

### Typographie

- **En-tête zone** : `text-lg font-semibold` + Badge pour le code
- **En-tête colonne** : `font-semibold bg-muted/50`
- **Nom service** : `font-semibold bg-muted/30`
- **Prix** : `font-medium`

### Espacement

- **Padding cellule** : `p-3` (en-têtes), `p-2` (cellules)
- **Gap entre zones** : `space-y-6`
- **Largeur min cellule** : `min-w-[80px]`

---

## 📱 Responsive

### Desktop (>1024px)

- Grille complète visible
- Toutes les colonnes affichées
- Scroll horizontal si nécessaire

### Tablet (768-1024px)

- Scroll horizontal automatique
- Colonnes compressées
- Zones empilées verticalement

### Mobile (<768px)

- Scroll horizontal obligatoire
- Colonnes fixes (80px min)
- Une zone visible à la fois

---

## 🚀 Améliorations futures

### Phase 2 (À venir)

- [ ] **Import CSV** : Importer grille depuis Excel
- [ ] **Export CSV** : Exporter grille vers Excel
- [ ] **Copier/Coller** : Copier une ligne/colonne
- [ ] **Remplissage auto** : Remplir automatiquement une zone
- [ ] **Historique** : Voir l'historique des modifications
- [ ] **Templates** : Modèles de grilles pré-remplis

### Phase 3 (Plus tard)

- [ ] **Calcul automatique** : Suggérer prix basé sur distance
- [ ] **Marge bénéficiaire** : Afficher marge par zone/service
- [ ] **Statistiques** : Zones/services les plus utilisés
- [ ] **Alertes** : Prix anormalement bas/élevés

---

## 🐛 Problèmes résolus

### Problème 1 : Boutons "Ajouter" ne fonctionnaient pas

**Avant :**
```typescript
// Bouton appelait setIsCreating(true) mais aucun formulaire
<Button onClick={() => setIsCreating(true)}>Ajouter une zone</Button>
```

**Après :**
```typescript
// Formulaire s'affiche quand isCreating = true
{isCreating && (
  <div className="p-4 border rounded-lg">
    <Input placeholder="Code zone" />
    <Button onClick={handleCreate}>Créer</Button>
  </div>
)}
```

### Problème 2 : Interface peu intuitive

**Avant :**
- 4 onglets à naviguer
- Pas d'instructions claires
- Format différent d'Excel

**Après :**
- Page unique
- Instructions en haut
- Format Excel identique

### Problème 3 : Pas de guide utilisateur

**Avant :**
- Aucune explication
- Utilisateur perdu

**Après :**
- Alert avec instructions
- Exemple concret
- Raccourcis clavier

---

## 📚 Documentation utilisateur

### FAQ

**Q : Comment marquer un service comme non disponible ?**
R : Saisissez "0" ou laissez la cellule vide, elle affichera "N/A".

**Q : Comment ajouter une nouvelle zone ?**
R : Cliquez sur "Options avancées" → Onglet "Zones" → "Ajouter une zone".

**Q : Comment modifier l'ordre des zones ?**
R : Les zones sont triées par le champ `order`. Modifiez-le dans "Options avancées".

**Q : Puis-je importer ma grille Excel ?**
R : Pas encore, cette fonctionnalité arrive en Phase 2.

**Q : Les prix sont-ils sauvegardés automatiquement ?**
R : Oui, dès que vous appuyez sur Entrée ou que vous cliquez ailleurs.

---

## 🎓 Tutoriel vidéo (à créer)

### Script proposé

1. **Introduction** (0:00-0:30)
   - Présentation de la nouvelle interface
   - Avantages par rapport à l'ancienne

2. **Remplir la grille** (0:30-2:00)
   - Cliquer sur une cellule
   - Saisir un prix
   - Valider avec Entrée
   - Marquer N/A

3. **Options avancées** (2:00-3:30)
   - Ajouter une zone
   - Ajouter un service
   - Configurer le forfait hors gabarit

4. **Astuces** (3:30-4:00)
   - Raccourcis clavier
   - Copier une zone (à venir)
   - Export CSV (à venir)

---

## ✅ Checklist de déploiement

- [x] Interface redessinée (format Excel)
- [x] Édition inline fonctionnelle
- [x] Gestion N/A
- [x] Options avancées masquées
- [x] Instructions utilisateur
- [x] Codes couleurs intuitifs
- [x] Responsive design
- [x] Tri des zones par ordre
- [x] Formulaires création zones/services
- [x] Documentation complète
- [ ] Tests utilisateur
- [ ] Tutoriel vidéo
- [ ] Import/Export CSV

---

## 📝 Notes de version

### v2.0.0 - Refonte complète de l'interface

**Date :** 22 janvier 2026

**Changements majeurs :**
- ✅ Interface type Excel
- ✅ Édition inline
- ✅ Page unique (plus d'onglets)
- ✅ Instructions intégrées
- ✅ Options avancées masquées

**Migrations nécessaires :**
- Aucune (rétrocompatible)

**Breaking changes :**
- Aucun

---

## 🙏 Remerciements

Merci pour vos retours qui ont permis de créer cette interface beaucoup plus intuitive !


