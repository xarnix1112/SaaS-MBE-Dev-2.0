# 🔔 Système de Notifications

## 📋 Vue d'ensemble

Système de notifications centralisé, sécurisé et évolutif permettant à chaque client du SaaS d'être alerté des événements importants liés à ses devis.

### 🎯 Objectifs

- ✅ Alerter les clients des événements importants
- ✅ Affichage via une cloche 🔔 dans le dashboard
- ✅ Consultation dans un drawer (panneau latéral)
- ✅ Chaque client ne voit QUE ses propres notifications
- ✅ Compatible avec messages clients, paiements Stripe, changements d'état
- ✅ Prêt pour résumé quotidien par email

---

## 🗄️ Modèle de données

### Collection Firestore : `notifications`

```typescript
{
  id: string;                 // ID unique généré par Firestore
  clientSaasId: string;       // ID du client SaaS (clé de sécurité)
  devisId: string;            // ID du devis concerné
  type: NotificationType;     // Type de notification
  title: string;              // Titre court (ex: "Paiement reçu")
  message: string;            // Message lisible
  createdAt: Timestamp;       // Date de création
}
```

**⚠️ Important :** Pas de champ `read`
- Si la notification existe → elle est non lue
- Si elle est supprimée → elle est lue

---

## 🏷️ Types de notifications

```typescript
type NotificationType =
  | "NEW_MESSAGE"           // Nouveau message client
  | "PAYMENT_RECEIVED"      // Paiement principal reçu
  | "DEVIS_SENT"           // Devis envoyé au client
  | "DEVIS_PAID"           // Devis entièrement payé
  | "DEVIS_PARTIALLY_PAID" // Paiement partiel reçu
  | "SURCOUT_CREATED";     // Surcoût ajouté au devis
```

---

## 🔔 Création des notifications (Backend)

### 1. Nouveau message client (Gmail Sync)

**Emplacement :** `server/ai-proxy.js` - Fonction `storeGmailMessage`

```javascript
// Après sauvegarde du message dans emailMessages
await createNotification(firestore, {
  clientSaasId: devis.clientSaasId,
  devisId: devis.id,
  type: NOTIFICATION_TYPES.NEW_MESSAGE,
  title: 'Nouveau message client',
  message: `Le client a répondu au devis ${devis.reference}`,
});
```

### 2. Paiement confirmé (Webhook Stripe)

**Emplacement :** `server/stripe-connect.js` - Fonction `handleStripeWebhook`

```javascript
// Dans checkout.session.completed
await createNotification(firestore, {
  clientSaasId: client.id,
  devisId: devisId,
  type: paiement.type === 'PRINCIPAL' 
    ? NOTIFICATION_TYPES.PAYMENT_RECEIVED 
    : NOTIFICATION_TYPES.SURCOUT_CREATED,
  title: paiement.type === 'PRINCIPAL' 
    ? 'Paiement reçu' 
    : 'Paiement de surcoût reçu',
  message: `Le devis ${devis.reference} a été payé (${paiement.amount.toFixed(2)}€)`,
});
```

### 3. Autres événements (à implémenter)

```javascript
// Devis envoyé
await createNotification(firestore, {
  clientSaasId,
  devisId,
  type: NOTIFICATION_TYPES.DEVIS_SENT,
  title: 'Devis envoyé',
  message: `Le devis ${devisReference} a été envoyé au client`,
});

// Tous les paiements reçus
await createNotification(firestore, {
  clientSaasId,
  devisId,
  type: NOTIFICATION_TYPES.DEVIS_PAID,
  title: 'Devis entièrement payé',
  message: `Le devis ${devisReference} a été payé intégralement`,
});
```

---

## 🌐 API Backend

### GET /api/notifications

Récupère toutes les notifications actives d'un client.

**Query params :**
- `clientId` (string) - ID du client SaaS

**Response :**
```json
[
  {
    "id": "notif_123",
    "clientSaasId": "client_456",
    "devisId": "gs_789",
    "type": "NEW_MESSAGE",
    "title": "Nouveau message client",
    "message": "Le client a répondu au devis DEV-GS-1",
    "createdAt": "2026-01-13T15:30:00.000Z"
  }
]
```

**Firestore query :**
```javascript
.where("clientSaasId", "==", clientId)
.orderBy("createdAt", "desc")
.limit(20)
```

### GET /api/notifications/count

Compte le nombre de notifications non lues.

**Query params :**
- `clientId` (string) - ID du client SaaS

**Response :**
```json
{
  "count": 3
}
```

### DELETE /api/notifications/:id

Supprime une notification (marque comme lue).

**Params :**
- `id` (string) - ID de la notification

**Query params :**
- `clientId` (string) - ID du client SaaS (sécurité)

**Response :**
```json
{
  "success": true
}
```

---

## 🎨 Frontend (React)

### Composant NotificationBell

**Fichier :** `src/components/notifications/NotificationBell.tsx`

**Fonctionnalités :**
- ✅ Icône cloche avec badge rouge
- ✅ Polling automatique toutes les 30 secondes
- ✅ Compteur (9+ si > 9 notifications)
- ✅ Clic → Ouvre le drawer

**Usage :**
```tsx
<NotificationBell
  clientId="client_123"
  onClick={() => setIsDrawerOpen(true)}
/>
```

### Composant NotificationDrawer

**Fichier :** `src/components/notifications/NotificationDrawer.tsx`

**Fonctionnalités :**
- ✅ Panneau latéral (Sheet)
- ✅ Liste scrollable des notifications
- ✅ Icône selon type de notification
- ✅ Date relative ("il y a 5 minutes")
- ✅ Clic → Supprime + Redirige
- ✅ Bouton X pour supprimer sans rediriger

**Usage :**
```tsx
<NotificationDrawer
  clientId="client_123"
  open={isDrawerOpen}
  onOpenChange={setIsDrawerOpen}
  onNotificationRead={() => {
    // Callback après lecture
  }}
/>
```

### Intégration dans AppHeader

**Fichier :** `src/components/layout/AppHeader.tsx`

```tsx
const [isDrawerOpen, setIsDrawerOpen] = useState(false);

<NotificationBell
  clientId={clientId}
  onClick={() => setIsDrawerOpen(true)}
/>

<NotificationDrawer
  clientId={clientId}
  open={isDrawerOpen}
  onOpenChange={setIsDrawerOpen}
/>
```

---

## 🔐 Sécurité Firestore

### Règles de sécurité

**Fichier :** `firestore.rules`

```javascript
match /notifications/{notificationId} {
  // Lecture: seulement si appartient à l'utilisateur
  allow read: if request.auth != null 
    && request.auth.uid == resource.data.clientSaasId;
  
  // Suppression: seulement si appartient à l'utilisateur
  allow delete: if request.auth != null 
    && request.auth.uid == resource.data.clientSaasId;
  
  // Création: seulement par le backend (Firebase Admin SDK)
  allow create: if false;
  
  // Mise à jour: interdit (on supprime plutôt)
  allow update: if false;
}
```

**⚠️ Important :**
- Les utilisateurs ne peuvent PAS créer de notifications directement
- Les notifications sont créées uniquement par le backend
- Chaque client ne voit QUE ses notifications

---

## 📊 Flux complet

### 1. Paiement reçu

```
Webhook Stripe reçu
  ↓
Paiement marqué PAID
  ↓
createNotification({
  type: PAYMENT_RECEIVED,
  title: "Paiement reçu",
  message: "Le devis DEV-GS-1 a été payé (31.00€)"
})
  ↓
Notification sauvegardée dans Firestore
  ↓
Frontend (polling 30s) détecte la nouvelle notification
  ↓
Badge cloche : 0 → 1
  ↓
Client clique sur la cloche
  ↓
Drawer s'ouvre avec la notification
  ↓
Client clique sur la notification
  ↓
DELETE /api/notifications/:id
  ↓
Redirection vers /devis/gs_xxx?tab=paiements
  ↓
Badge cloche : 1 → 0
```

### 2. Nouveau message client

```
Email reçu via Gmail API
  ↓
Message sauvegardé dans emailMessages
  ↓
createNotification({
  type: NEW_MESSAGE,
  title: "Nouveau message client",
  message: "Le client a répondu au devis DEV-GS-1"
})
  ↓
Notification sauvegardée
  ↓
Frontend détecte (polling)
  ↓
Badge : 0 → 1
  ↓
Client clique → Redirection vers /devis/gs_xxx?tab=messages
```

---

## 🎯 Redirection contextuelle

Chaque type de notification redirige vers la page appropriée :

| Type | Redirection |
|------|-------------|
| `NEW_MESSAGE` | `/devis/:id?tab=messages` |
| `PAYMENT_RECEIVED` | `/devis/:id?tab=paiements` |
| `DEVIS_PAID` | `/devis/:id?tab=paiements` |
| `DEVIS_PARTIALLY_PAID` | `/devis/:id?tab=paiements` |
| `SURCOUT_CREATED` | `/devis/:id?tab=paiements` |
| `DEVIS_SENT` | `/devis/:id` |

---

## 🔮 Évolution future : Résumé quotidien

### Préparation incluse

Le système actuel est **prêt pour un résumé quotidien** par email :

1. **Lire les notifications du jour :**
```javascript
const today = new Date();
today.setHours(0, 0, 0, 0);

const notifications = await firestore
  .collection('notifications')
  .where('clientSaasId', '==', clientId)
  .where('createdAt', '>=', today)
  .get();
```

2. **Agréger par devis :**
```javascript
const byDevis = {};
notifications.forEach(notif => {
  if (!byDevis[notif.devisId]) {
    byDevis[notif.devisId] = [];
  }
  byDevis[notif.devisId].push(notif);
});
```

3. **Envoyer email récapitulatif :**
```javascript
const emailContent = generateDailySummary(byDevis);
await sendEmail({
  to: client.email,
  subject: 'Résumé quotidien - QuoteFlow Pro',
  html: emailContent,
});
```

**Aucune refonte nécessaire !** 🎉

---

## 🔥 Index Firestore REQUIS

**⚠️ IMPORTANT :** Avant de tester les notifications, tu DOIS créer l'index Firestore composite.

### Créer l'index

1. **Clique sur ce lien** (ou attends l'erreur qui te donnera le lien) :
```
https://console.firebase.google.com/v1/r/project/sdv-automation-mbe/firestore/indexes?create_composite=Clhwcm9qZWN0cy9zZHYtYXV0b21hdGlvbi1tYmUvZGF0YWJhc2VzLyhkZWZhdWx0KS9jb2xsZWN0aW9uR3JvdXBzL25vdGlmaWNhdGlvbnMvaW5kZXhlcy9fEAEaEAoMY2xpZW50U2Fhc0lkEAEaDQoJY3JlYXRlZEF0EAIaDAoIX19uYW1lX18QAg
```

2. **Confirme la création** dans Firebase Console

3. **Attends 2-5 minutes** que l'index soit construit (statut "Enabled")

**Détails de l'index :**
- Collection : `notifications`
- Champs :
  - `clientSaasId` (Ascending)
  - `createdAt` (Descending)

**Pourquoi ?**
La requête combine `where()` et `orderBy()` sur des champs différents, ce qui nécessite un index composite :
```javascript
firestore
  .collection('notifications')
  .where('clientSaasId', '==', clientId)  // ← Filtre
  .orderBy('createdAt', 'desc')           // ← Tri
```

---

## 🧪 Tests

### Test manuel

1. **Créer une notification de test :**
```bash
# Via Firebase Console
Collection: notifications
Document ID: test_123
Données:
{
  clientSaasId: "dxHUjMCaJ0A7vFBiGNFR",
  devisId: "gs_6fb75318",
  type: "PAYMENT_RECEIVED",
  title: "Test notification",
  message: "Ceci est un test",
  createdAt: Timestamp.now()
}
```

2. **Vérifier dans l'app :**
- Ouvrir le dashboard
- Badge cloche devrait afficher "1"
- Cliquer sur la cloche
- Notification visible dans le drawer
- Cliquer dessus → Redirection + suppression

### Test automatique (à venir)

```javascript
// Test création notification
test('createNotification with valid data', async () => {
  const notifId = await createNotification(firestore, {
    clientSaasId: 'test_client',
    devisId: 'test_devis',
    type: 'NEW_MESSAGE',
    title: 'Test',
    message: 'Test message',
  });
  expect(notifId).toBeDefined();
});

// Test sécurité
test('user cannot create notifications directly', async () => {
  // Should fail with permission denied
  await expect(
    firestore.collection('notifications').add({...})
  ).rejects.toThrow();
});
```

---

## 📝 Notes importantes

### Performance

- **Polling 30s :** Équilibre entre temps réel et charge serveur
- **Limite 20 notifications :** Les plus anciennes ne sont pas affichées
- **Suppression immédiate :** Pas de base "archive" pour l'instant

### Sécurité

- ✅ Règles Firestore strictes
- ✅ Vérification `clientId` dans l'API
- ✅ Pas de création directe par les utilisateurs
- ✅ Suppression uniquement de ses propres notifications

### UX

- ✅ Badge rouge visible
- ✅ Drawer non intrusif
- ✅ Navigation contextuelle
- ✅ Date relative facile à lire
- ✅ Suppression simple (clic ou bouton X)

---

**Date :** 13 janvier 2026  
**Version :** 1.4.0  
**Auteur :** Assistant IA + Clément  
**Statut :** ✅ Implémenté et prêt pour les tests

