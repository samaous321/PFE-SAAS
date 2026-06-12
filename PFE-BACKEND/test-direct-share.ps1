# 📧 Script Test PowerShell - Partage Direct User-to-User avec Email

# Configuration
$BASE_URL = "http://localhost:3000/api"
$USER1_TOKEN = "your_user1_token_here"  # Remplacer par le token réel
$FILE_ID = "file_id_here"                # Remplacer par l'ID du fichier
$USER2_ID = "user_id_here"               # Remplacer par l'ID de l'utilisateur 2

$headers = @{
    "Authorization" = "Bearer $USER1_TOKEN"
    "Content-Type"  = "application/json"
}

Write-Host "═════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  🧪 TEST - Partage Direct avec Email et Description" -ForegroundColor Cyan
Write-Host "═════════════════════════════════════════════════════════════" -ForegroundColor Cyan

# Test 1: Partage Simple
Write-Host ""
Write-Host "📝 Test 1: Partage Simple (sans note)" -ForegroundColor Yellow
Write-Host "─────────────────────────────────────" -ForegroundColor Gray

$body1 = @{
    recipientUserId = $USER2_ID
    accessControl = "recipient-only"
    expiresInHours = 24
    notifyRecipient = $true
} | ConvertTo-Json

try {
    $response1 = Invoke-RestMethod -Uri "$BASE_URL/files/$FILE_ID/share" `
        -Method POST `
        -Headers $headers `
        -Body $body1

    Write-Host "✅ Succès!" -ForegroundColor Green
    $response1 | ConvertTo-Json | Write-Host -ForegroundColor Green
} catch {
    Write-Host "❌ Erreur: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test 2: Partage avec Sujet et Note
Write-Host "📝 Test 2: Partage avec Sujet et Description" -ForegroundColor Yellow
Write-Host "──────────────────────────────────────────" -ForegroundColor Gray

$body2 = @{
    recipientUserId = $USER2_ID
    accessControl = "recipient-only"
    expiresInHours = 48
    maxUses = 3
    subject = "📊 Rapport Q4 2025 - À réviser d'urgence"
    note = @"
Bonjour,

Veuillez vérifier les chiffres du trimestre Q4 ci-joint.

Points importants:
- Vérifier le total des ventes (Colonne C)
- Valider les marges bénéficiaires
- Ajouter vos commentaires

Merci pour votre diligence!
"@
    notifyRecipient = $true
} | ConvertTo-Json

try {
    $response2 = Invoke-RestMethod -Uri "$BASE_URL/files/$FILE_ID/share" `
        -Method POST `
        -Headers $headers `
        -Body $body2

    Write-Host "✅ Succès!" -ForegroundColor Green
    $response2 | ConvertTo-Json | Write-Host -ForegroundColor Green
} catch {
    Write-Host "❌ Erreur: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test 3: Partage Multiple (Bulk)
Write-Host "📝 Test 3: Partage avec Plusieurs Destinataires" -ForegroundColor Yellow
Write-Host "──────────────────────────────────────────────" -ForegroundColor Gray

$body3 = @{
    recipientUserIds = @($USER2_ID, "another_user_id_1", "another_user_id_2")
    accessControl = "recipient-only"
    expiresInHours = 48
    subject = "🤝 Présentation Client - Révision équipe"
    note = @"
Équipe,

Veuillez réviser la présentation client ci-jointe.

Deadline: demain 17h

Merci!
"@
    notifyRecipient = $true
} | ConvertTo-Json

try {
    $response3 = Invoke-RestMethod -Uri "$BASE_URL/files/$FILE_ID/share" `
        -Method POST `
        -Headers $headers `
        -Body $body3

    Write-Host "✅ Succès!" -ForegroundColor Green
    $response3 | ConvertTo-Json | Write-Host -ForegroundColor Green
} catch {
    Write-Host "❌ Erreur: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test 4: Vérifier l'historique
Write-Host "📝 Test 4: Vérifier l'Historique de Partage" -ForegroundColor Yellow
Write-Host "──────────────────────────────────────────" -ForegroundColor Gray

try {
    $response4 = Invoke-RestMethod -Uri "$BASE_URL/shares/history?limit=5&sortBy=-createdAt" `
        -Method GET `
        -Headers $headers

    Write-Host "✅ Succès!" -ForegroundColor Green
    Write-Host "Nombre de partages: $($response4.data.Count)" -ForegroundColor Cyan
    
    $response4.data | ForEach-Object {
        Write-Host ""
        Write-Host "📄 $($_.fileName)" -ForegroundColor White
        Write-Host "  À: $($_.sharedWith.email)" -ForegroundColor Gray
        if ($_.note) {
            Write-Host "  Note: $($_.note.Substring(0, [Math]::Min(50, $_.note.Length)))..." -ForegroundColor Gray
        }
        if ($_.subject) {
            Write-Host "  Sujet: $($_.subject)" -ForegroundColor Gray
        }
        Write-Host "  Date: $($_.createdAt)" -ForegroundColor Gray
    }
} catch {
    Write-Host "❌ Erreur: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "═════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "✅ Tests Terminés!" -ForegroundColor Green
Write-Host "═════════════════════════════════════════════════════════════" -ForegroundColor Cyan
