# Guide de configuration MBE Hub – Envoyer les expéditions via l'API eShip

Ce guide vous explique étape par étape comment configurer votre compte MBE pour récupérer les informations nécessaires à l'intégration API.

---

## Rappel : ce que nous allons faire

1. **Bouton "Envoyer vers MBE Hub"** (à la place de "Expédier") sur la page Expéditions
2. Clic → ouverture d'une modal pour remplir/vérifier les informations
3. Choix du **service** (Standard, Express, ou autre selon ce que propose MBE)
4. Validation → création de l'expédition en **brouillon** dans le Hub
5. Le **Centre MBE** valide et finalise sur HUB, imprime l'étiquette

---

## Vue d'ensemble : deux API possibles

MBE propose deux types d'API :

| API | Type | Où obtenir les infos | Usage typique |
|-----|------|----------------------|---------------|
| **eShip SOAP** | Web Service SOAP | Centre MBE (username + password + URL) | Création d'expéditions, brouillons, tarification |
| **eShip Web REST** | REST JSON | eship.mbeglobal.com ou mbehub.fr | pushOrder, pushShipment, suivi |

Le portail **mbehub.fr** gère des identifiants API. Ce que vous voyez dans « Gestion de la clé API du Centre » peut servir pour l'une ou l'autre API.

---

## Étape 1 : Ce que vous voyez sur mbehub.fr

Vous êtes sur **Paramétrages > Gestion de la clé API du Centre** (`mbehub.fr`).

### Deux « entités » selon le filtre « Entité juridique »

| Entité juridique | Rôle typique | Exemple Login | Usage |
|------------------|--------------|---------------|-------|
| **Client** | ONLINEMBE_USER | `DmxsLu@jXZSxYds3Wwtk` ou Utilisateur `MBEAUCTIONHOUSE.Fr 0026.mol` | Création d'expéditions côté client |
| **Centre MBE** | PRINT_SPEAK | `XFPPWqkBn6gnHKek5T9n` | Finalisation et impression par le centre |

**Pour votre cas** (création de brouillons par le client) : utilisez les identifiants **Client** avec le rôle **ONLINEMBE_USER**.

### Récupérer le mot de passe (obligatoire)

Le mot de passe **n'est jamais affiché** dans le tableau. Pour l'obtenir :

1. Cliquez sur **« + CRÉER IDENTIFIANTS »**
2. Filtres : Entité juridique = **Client**, Rôle = **ONLINEMBE_USER**
3. Le mot de passe est affiché **une seule fois** à la création
4. **Copiez-le immédiatement** dans un gestionnaire de mots de passe

### Champ « Supplier Center Pickup Address »

Si ce champ apparaît (liste d'adresses FR2707, FR0010, etc.) : sélectionnez le centre qui traitera vos expéditions (ex. FR0026 pour Nice).

---

## Étape 2 : Contacter votre Centre MBE

Votre **Centre MBE** (ou MBE Global / Fortidia selon votre configuration) gère l’activation de l’API et les permissions.

### À demander explicitement

1. **Accès à l’API eShip (SOAP)**  
   « Je souhaite intégrer l’API eShip pour créer des expéditions depuis mon logiciel. »

2. **URL du service SOAP**  
   Exemple attendu : `https://xxx.xxx.xxx/xxx/eShipService.asmx` ou équivalent.  
   Indiquez que vous avez besoin de l’URL exacte du endpoint SOAP eShip.

3. **Identifiants MOL (API)**  
   - Un **username** (login MOL ou identifiant API)  
   - Un **mot de passe** (mot de passe API, distinct du mot de passe du portail web si possible)  
   Demandez explicitement : « Quels sont les identifiants pour l’authentification aux appels API eShip ? »

4. **Paramétrage pour les brouillons / étiquettes**  
   « Je souhaite créer les expéditions en brouillon depuis l’API et que le Centre finalise et imprime les étiquettes. »  
   Cela correspond en général à un compte MOL **sans** permission d’impression d’étiquettes transporteur.

5. **Services activés**  
   « Quels services sont activés pour mon compte ? » (Standard, Express, etc.)  
   Et si possible : mapping entre ces services et les codes API (ex. SSE, SEE, SAR).

---

## Étape 3 : Trouver l'URL du service (SOAP ou REST)

**L'URL n'apparaît pas** sur la page « Gestion de la clé API ». Il faut la chercher ailleurs ou la demander au Centre.

### Où chercher sur mbehub.fr

1. **Paramètres** (icône engrenage en haut à droite)
2. Toute section **« API »**, **« Intégration »**, **« Web Service »**
3. Menu **Expéditions** : liens vers documentation ou URL
4. **Aide** ou **FAQ**

### Ce qu'il faut demander au Centre MBE

- **Si API SOAP** : URL du type `https://xxx.xxx.xxx/xxx/eShipService.asmx`
- **Si API REST** : base du type `https://api.eship.mbeglobal.com/1.2/`

Le Centre peut confirmer quel type d'API vous utilisez et l'URL exacte.

---

## Étape 4 : Récupérer les informations par échange

En absence d’interface dédiée API, votre Centre MBE peut vous transmettre un document ou un mail contenant :

| Information          | Exemple / format                         | Où la noter |
|----------------------|------------------------------------------|-------------|
| URL SOAP eShip       | `https://.../eShipService.asmx`          | À enregistrer dans l’app (voir ci-dessous) |
| Username (MOL)       | `votre_identifiant`                      | Idem |
| Mot de passe API     | `••••••••`                               | Idem |
| Services activés     | Standard (SAR), Express (SEE), etc.     | Pour le choix dans l’interface |

---

## Étape 5 : Où stocker ces informations dans l’application

Une fois les informations reçues, vous les fournirez pour la configuration :

1. **Paramètres MBE Hub** (à venir dans l’app)  
   - URL du service SOAP  
   - Username  
   - Mot de passe  

2. **Sécurité**  
   - Stockage prévu : Firestore `saasAccounts/{id}/secrets/mbehub` (chiffré / sécurisé)  
   - Pas de saisie de ces données dans des fichiers ou des variables en clair dans le code  

---

## Étape 6 : Checklist avant de passer à l’implémentation

Avant de lancer l’implémentation, assurez-vous d’avoir :

- [ ] URL exacte du service SOAP eShip
- [ ] Username (identifiant API)
- [ ] Mot de passe API
- [ ] Confirmation que les expéditions peuvent être créées en brouillon et finalisées par le Centre
- [ ] Liste des services disponibles (Standard, Express, etc.) avec leurs codes si possible

---

## Exemple de mail à envoyer à votre Centre MBE (FR0026 – Nice)

> Bonjour,
>
> J’ai accès au portail mbehub.fr et je vois les identifiants API dans Paramétrages > Gestion de la clé API du Centre (Client, ONLINEMBE_USER). J’ai besoin des éléments suivants pour intégrer la création d’expéditions depuis mon logiciel MBE SDV :
>
> 1. **URL exacte du service API** : SOAP (`https://…/eShipService.asmx`) ou REST (`https://api.eship.mbeglobal.com/…`) selon notre configuration.
> 2. **Confirmation** que le Login affiché correspond bien au username (ou API Key) à utiliser pour les appels API.
> 3. **Validation** que je peux créer les expéditions en brouillon via l’API et que le Centre les finalise et imprime les étiquettes.
> 4. **Liste des services activés** (Standard, Express, etc.) avec leurs codes API si possible.
>
> Merci,
> [Votre nom]

---

## En cas de blocage

- **Documentation SOAP** : [Introduction API eShip SOAP](https://sites.google.com/fortidia.com/eship-api-documentation/introduction)  
- **Documentation REST** : [api-doc.eship.mbeglobal.com](https://api-doc.eship.mbeglobal.com)  
- **Contact** : Votre Centre MBE (FR0026) ou MBE Global / Fortidia  
- La doc indique : *« Si vous avez des questions sur les fonctionnalités accessibles avec vos identifiants API, nous vous recommandons de contacter votre Centre MBE de référence. »*
