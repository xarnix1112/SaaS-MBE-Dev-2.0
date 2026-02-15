# Règles de protection des branches GitHub

> Guide pas à pas pour configurer la protection de tes branches — chaque écran expliqué

---

## Pourquoi protéger les branches ?

Sans protection, tu (ou quelqu’un d’autre) peux :
- pousser directement sur `main` sans passer par une PR ;
- faire un `git push --force` et écraser l’historique ;
- supprimer la branche `main` par erreur.

La protection des branches limite ces risques en imposant des règles (PR obligatoire, interdiction du force push, etc.).

---

## Étape 0 : Accéder aux paramètres du dépôt

1. Ouvre ton navigateur et va sur **GitHub.com**
2. Connecte-toi si besoin
3. Clique sur ton **avatar** (en haut à droite) → **"Your repositories"** (ou va directement sur ton dépôt)
4. Clique sur le dépôt concerné (ex. "SaaS-MBE-SDV")
5. En haut de la page du dépôt, clique sur **"Settings"** (onglet)
   - Si tu ne vois pas "Settings", ton compte n’a peut‑être pas les droits admin sur ce dépôt
6. Dans le menu de gauche, sous **"Code and automation"**, clique sur **"Branches"**

Tu arrives sur la page **"Branch protection rules"**.

---

## Étape 1 : Créer une règle pour la branche `main`

1. Clique sur **"Add branch protection rule"** (ou "Add rule")
2. Dans le champ **"Branch name pattern"**, tape `main` ou `master` (selon le nom de ta branche principale)
   - Cela applique la règle uniquement à cette branche

3. **"Require a pull request before merging"**
   - Coche cette case
   - Sous-option **"Require approvals"** : mets `0` si tu es seul, `1` ou plus si tu veux une validation
   - Coche **"Dismiss stale pull request approvals when new commits are pushed"** pour que les approbations soient invalidées si tu modifies la PR

4. **"Require status checks to pass before merging"**
   - Optionnel : utile si tu as des tests ou du CI
   - Si tu n’en as pas, laisse décoché pour l’instant

5. **"Require branches to be up to date before merging"**
   - Coche cette case
   - Ainsi, il faut que ta branche soit à jour avec `main` avant de fusionner

6. **"Do not allow bypassing the above settings"**
   - Coche cette case
   - Même les admins devront suivre ces règles

7. **"Allow force pushes"**
   - Décoche cette case
   - Le force push (`git push --force`) sera interdit sur `main`

8. **"Allow deletions"**
   - Décoche cette case
   - Personne ne pourra supprimer la branche `main`

9. En bas de la page, clique sur **"Create"** ou **"Save changes"**

---

## Étape 2 : Créer une règle pour la branche `staging`

1. Reviens sur **Settings** → **Branches** (menu de gauche)
2. Clique à nouveau sur **"Add branch protection rule"**
3. Dans **"Branch name pattern"**, tape : `staging`

4. Coche **"Require a pull request before merging"**
   - Moins strict que pour `main`, mais utile pour garder un historique propre

5. Décoche **"Allow force pushes"**
6. Décoche **"Allow deletions"**

7. Clique sur **"Create"** ou **"Save changes"**

---

## Résumé du workflow

```
feature/ma-branche  →  PR vers staging  →  merge
       staging      →  PR vers main (ou master)  →  merge (déploiement prod)
```

Règle importante : ne jamais pousser directement sur ta branche principale (`main` ou `master`). Toujours passer par une Pull Request pour pouvoir réviser avant la mise en prod.

---

## Que se passe-t-il si j’essaie de push directement sur main ?

Avec la protection activée, tu obtiendras une erreur du type :

```
! [remote rejected] main -> main (protected branch hook declined)
error: failed to push some refs
```

C’est normal : la branche est protégée. Pour mettre à jour `main`, il faut :
1. Créer une branche depuis `main` ou `staging`
2. Faire tes modifications
3. Ouvrir une Pull Request vers `main`
4. Fusionner la PR sur GitHub

---

## Modifier ou supprimer une règle

1. Va dans **Settings** → **Branches**
2. Tu verras la liste des règles (ex. `main`, `staging`)
3. Clique sur **"Edit"** pour modifier
4. Ou sur **"Delete"** pour supprimer la règle (à faire avec précaution)
