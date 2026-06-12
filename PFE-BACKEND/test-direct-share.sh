#!/bin/bash
# 📧 Script Test - Partage Direct User-to-User avec Email

# Configuration
BASE_URL="http://localhost:3000/api"
USER1_TOKEN="your_user1_token_here"  # Remplacer par le token réel
FILE_ID="file_id_here"                # Remplacer par l'ID du fichier
USER2_ID="user_id_here"               # Remplacer par l'ID de l'utilisateur 2

echo "═════════════════════════════════════════════════════════════"
echo "  🧪 TEST - Partage Direct avec Email et Description"
echo "═════════════════════════════════════════════════════════════"

# Test 1: Partage Simple
echo ""
echo "📝 Test 1: Partage Simple (sans note)"
echo "─────────────────────────────────────"

curl -X POST "$BASE_URL/files/$FILE_ID/share" \
  -H "Authorization: Bearer $USER1_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "recipientUserId": "'$USER2_ID'",
    "accessControl": "recipient-only",
    "expiresInHours": 24,
    "notifyRecipient": true
  }' \
  -w "\nHTTP Status: %{http_code}\n" \
  -s | jq '.'

echo ""

# Test 2: Partage avec Sujet et Note
echo "📝 Test 2: Partage avec Sujet et Description"
echo "──────────────────────────────────────────"

curl -X POST "$BASE_URL/files/$FILE_ID/share" \
  -H "Authorization: Bearer $USER1_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "recipientUserId": "'$USER2_ID'",
    "accessControl": "recipient-only",
    "expiresInHours": 48,
    "maxUses": 3,
    "subject": "📊 Rapport Q4 2025 - À réviser d'\''urgence",
    "note": "Bonjour,\n\nVeuillez vérifier les chiffres du trimestre Q4 ci-joint.\n\nPoints importants:\n- Vérifier le total des ventes (Colonne C)\n- Valider les marges bénéficiaires\n- Ajouter vos commentaires\n\nMerci pour votre diligence!",
    "notifyRecipient": true
  }' \
  -w "\nHTTP Status: %{http_code}\n" \
  -s | jq '.'

echo ""

# Test 3: Partage Multiple (Bulk)
echo "📝 Test 3: Partage avec Plusieurs Destinataires"
echo "──────────────────────────────────────────────"

curl -X POST "$BASE_URL/files/$FILE_ID/share" \
  -H "Authorization: Bearer $USER1_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "recipientUserIds": [
      "'$USER2_ID'",
      "another_user_id_1",
      "another_user_id_2"
    ],
    "accessControl": "recipient-only",
    "expiresInHours": 48,
    "subject": "🤝 Présentation Client - Révision équipe",
    "note": "Équipe,\n\nVeuillez réviser la présentation client ci-jointe.\n\nDeadline: demain 17h\n\nMerci!",
    "notifyRecipient": true
  }' \
  -w "\nHTTP Status: %{http_code}\n" \
  -s | jq '.'

echo ""

# Test 4: Vérifier l'historique
echo "📝 Test 4: Vérifier l'Historique de Partage"
echo "──────────────────────────────────────────"

curl -X GET "$BASE_URL/shares/history?limit=5&sortBy=-createdAt" \
  -H "Authorization: Bearer $USER1_TOKEN" \
  -w "\nHTTP Status: %{http_code}\n" \
  -s | jq '.'

echo ""
echo "═════════════════════════════════════════════════════════════"
echo "✅ Tests Terminés!"
echo "═════════════════════════════════════════════════════════════"
