#!/bin/bash

# Script pour démarrer Stripe CLI et écouter les webhooks
# Ce script doit être exécuté dans un terminal séparé

echo "🎧 Démarrage de Stripe CLI pour écouter les webhooks..."
echo ""
echo "⚠️  Ce terminal doit rester ouvert pendant que vous testez les paiements"
echo ""

# Vérifier si Stripe CLI est installé
if ! command -v stripe &> /dev/null; then
    echo "❌ Stripe CLI n'est pas installé"
    echo ""
    echo "📦 Installation :"
    echo "   brew install stripe/stripe-cli/stripe"
    echo ""
    exit 1
fi

# Vérifier si l'utilisateur est connecté
if ! stripe config --list &> /dev/null; then
    echo "⚠️  Vous n'êtes pas connecté à Stripe CLI"
    echo ""
    echo "🔑 Connexion :"
    echo "   stripe login"
    echo ""
    exit 1
fi

echo "✅ Stripe CLI est installé et configuré"
echo ""
echo "🔗 Écoute des webhooks sur http://localhost:8080/webhooks/stripe"
echo ""
echo "📝 Note : Copiez le 'webhook signing secret' (whsec_...) dans .env.local"
echo "          si ce n'est pas déjà fait"
echo ""
echo "─────────────────────────────────────────────────────────────────"
echo ""

# Démarrer l'écoute des webhooks
stripe listen --forward-to http://localhost:8080/webhooks/stripe

