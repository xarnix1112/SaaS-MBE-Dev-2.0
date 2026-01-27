#!/bin/bash

# Script pour créer l'index Firestore requis
# Ce script vérifie si Firebase CLI est installé et crée l'index

echo "🔥 Création de l'index Firestore pour la collection 'quotes'"
echo ""

# Vérifier si Firebase CLI est installé
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI n'est pas installé."
    echo ""
    echo "Pour installer Firebase CLI :"
    echo "  npm install -g firebase-tools"
    echo ""
    echo "OU créez l'index manuellement via Firebase Console :"
    echo "  https://console.firebase.google.com/project/sdv-automation-mbe/firestore/indexes"
    echo ""
    echo "Instructions détaillées dans : FIRESTORE_INDEX_SETUP.md"
    exit 1
fi

# Vérifier si l'utilisateur est connecté à Firebase
if ! firebase projects:list &> /dev/null; then
    echo "⚠️  Vous n'êtes pas connecté à Firebase."
    echo "Exécutez : firebase login"
    exit 1
fi

# Vérifier si le fichier firestore.indexes.json existe
if [ ! -f "firestore.indexes.json" ]; then
    echo "❌ Le fichier firestore.indexes.json n'existe pas."
    echo "Le fichier a été créé automatiquement."
    exit 1
fi

echo "✅ Firebase CLI détecté"
echo "✅ Fichier firestore.indexes.json trouvé"
echo ""
echo "📋 Index à créer :"
echo "   Collection: quotes"
echo "   Champs: saasAccountId (ASC), createdAt (DESC)"
echo ""
read -p "Voulez-vous créer cet index maintenant ? (o/N) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[OoYy]$ ]]; then
    echo "❌ Annulé."
    exit 0
fi

echo ""
echo "🚀 Déploiement de l'index..."
echo ""

# Déployer l'index
firebase deploy --only firestore:indexes

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Index déployé avec succès !"
    echo ""
    echo "⏱️  L'index prendra 1-3 minutes à être activé."
    echo "   Surveillez le statut dans Firebase Console :"
    echo "   https://console.firebase.google.com/project/sdv-automation-mbe/firestore/indexes"
    echo ""
    echo "✅ Une fois l'index 'Enabled', l'API /api/quotes fonctionnera correctement."
else
    echo ""
    echo "❌ Erreur lors du déploiement de l'index."
    echo ""
    echo "💡 Alternative : Créez l'index manuellement via Firebase Console"
    echo "   https://console.firebase.google.com/project/sdv-automation-mbe/firestore/indexes"
    exit 1
fi

