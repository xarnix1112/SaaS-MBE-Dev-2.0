# Script PowerShell pour déployer les index Firestore
# Usage: .\deploy-firestore-indexes.ps1

Write-Host "🔥 Déploiement des Index Firestore" -ForegroundColor Cyan
Write-Host ""

# Vérifier si Firebase CLI est installé
Write-Host "1️⃣ Vérification de Firebase CLI..." -ForegroundColor Yellow
try {
    $firebaseVersion = firebase --version 2>&1
    Write-Host "   ✅ Firebase CLI détecté : $firebaseVersion" -ForegroundColor Green
} catch {
    Write-Host "   ❌ Firebase CLI n'est pas installé." -ForegroundColor Red
    Write-Host ""
    Write-Host "   Pour installer Firebase CLI :" -ForegroundColor Yellow
    Write-Host "   npm install -g firebase-tools" -ForegroundColor White
    Write-Host ""
    exit 1
}

# Vérifier si l'utilisateur est connecté
Write-Host ""
Write-Host "2️⃣ Vérification de la connexion Firebase..." -ForegroundColor Yellow
try {
    firebase projects:list | Out-Null
    Write-Host "   ✅ Connecté à Firebase" -ForegroundColor Green
} catch {
    Write-Host "   ⚠️  Vous n'êtes pas connecté à Firebase." -ForegroundColor Yellow
    Write-Host "   Exécution de : firebase login" -ForegroundColor White
    firebase login
    if ($LASTEXITCODE -ne 0) {
        Write-Host "   ❌ Échec de la connexion" -ForegroundColor Red
        exit 1
    }
}

# Vérifier si le fichier firestore.indexes.json existe
Write-Host ""
Write-Host "3️⃣ Vérification du fichier firestore.indexes.json..." -ForegroundColor Yellow
if (Test-Path "firestore.indexes.json") {
    Write-Host "   ✅ Fichier trouvé" -ForegroundColor Green
    $indexContent = Get-Content "firestore.indexes.json" -Raw | ConvertFrom-Json
    $indexCount = $indexContent.indexes.Count
    Write-Host "   📋 $indexCount index(s) à déployer" -ForegroundColor Cyan
} else {
    Write-Host "   ❌ Le fichier firestore.indexes.json n'existe pas." -ForegroundColor Red
    Write-Host "   Assurez-vous d'être à la racine du projet." -ForegroundColor Yellow
    exit 1
}

# Sélectionner le projet de production
Write-Host ""
Write-Host "4️⃣ Sélection du projet Firebase..." -ForegroundColor Yellow
Write-Host "   Projet cible : saas-mbe-sdv-production" -ForegroundColor Cyan
firebase use saas-mbe-sdv-production
if ($LASTEXITCODE -ne 0) {
    Write-Host "   ❌ Échec de la sélection du projet" -ForegroundColor Red
    exit 1
}
Write-Host "   ✅ Projet sélectionné" -ForegroundColor Green

# Demander confirmation
Write-Host ""
Write-Host "5️⃣ Confirmation du déploiement..." -ForegroundColor Yellow
Write-Host "   Les index suivants seront déployés :" -ForegroundColor White
foreach ($index in $indexContent.indexes) {
    $fields = ($index.fields | ForEach-Object { "$($_.fieldPath) ($($_.order))" }) -join ", "
    Write-Host "   - $($index.collectionGroup) : $fields" -ForegroundColor Gray
}
Write-Host ""
$confirmation = Read-Host "   Continuer ? (O/N)"
if ($confirmation -ne "O" -and $confirmation -ne "o" -and $confirmation -ne "Y" -and $confirmation -ne "y") {
    Write-Host "   ❌ Annulé" -ForegroundColor Yellow
    exit 0
}

# Déployer les index
Write-Host ""
Write-Host "6️⃣ Déploiement des index..." -ForegroundColor Yellow
Write-Host "   ⏱️  Cela peut prendre 1-3 minutes..." -ForegroundColor Gray
Write-Host ""

firebase deploy --only firestore:indexes

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Déploiement réussi !" -ForegroundColor Green
    Write-Host ""
    Write-Host "📋 Prochaines étapes :" -ForegroundColor Cyan
    Write-Host "   1. Attendre 1-3 minutes que les index soient créés" -ForegroundColor White
    Write-Host "   2. Vérifier dans la console Firebase :" -ForegroundColor White
    Write-Host "      https://console.firebase.google.com/project/saas-mbe-sdv-production/firestore/indexes" -ForegroundColor Gray
    Write-Host "   3. Attendre que tous les index soient 'Enabled' (statut vert)" -ForegroundColor White
    Write-Host "   4. Tester l'application : cliquer sur 'Initialiser la grille tarifaire'" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "❌ Échec du déploiement" -ForegroundColor Red
    Write-Host "   Vérifiez les erreurs ci-dessus" -ForegroundColor Yellow
    exit 1
}
