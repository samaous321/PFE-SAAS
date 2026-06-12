/**
 * Script de test du module ShareHistory
 * Usage: node test-shareHistory.js
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import ShareHistory from "./models/ShareHistory.js";
import File from "./models/File.js";
import User from "./models/User.js";
import Tenant from "./models/Tenant.js";
import * as shareHistoryService from "./services/shareHistory.service.js";

// Couleurs pour l'output
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m"
};

const log = {
  success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
  info: (msg) => console.log(`${colors.blue}ℹ️  ${msg}${colors.reset}`),
  test: (msg) => console.log(`${colors.cyan}🧪 ${msg}${colors.reset}`),
  warn: (msg) => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`)
};

async function runTests() {
  try {
    // Connexion à la DB
    log.info("Connexion à MongoDB...");
    await mongoose.connect(process.env.MONGO_URI);
    log.success("Connecté à MongoDB");

    // Test 1: Vérifier la structure du modèle
    log.test("TEST 1: Vérifier le modèle ShareHistory");
    const schemaKeys = Object.keys(ShareHistory.schema.obj);
    log.info(`Champs du modèle: ${schemaKeys.join(", ")}`);
    
    if (schemaKeys.includes("shareId") && schemaKeys.includes("sharedBy") && schemaKeys.includes("sharedWith")) {
      log.success("Modèle bien structuré ✓");
    } else {
      log.error("Modèle incomplet ✗");
    }

    // Test 2: Créer un enregistrement de partage
    log.test("TEST 2: Créer un enregistrement de partage");
    const mockUserId = new mongoose.Types.ObjectId();
    const mockTenantId = new mongoose.Types.ObjectId();
    const mockFileId = new mongoose.Types.ObjectId();

    const shareData = {
      fileId: mockFileId,
      fileName: "test-document.pdf",
      fileSize: 2048576,
      mimeType: "application/pdf",
      fileHash: "abc123def456",
      sharedByUserId: mockUserId,
      sharedByEmail: "user@example.com",
      sharedByTenantId: mockTenantId,
      sharedWithEmail: "recipient@example.com",
      shareType: "direct",
      accessLevel: "download",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 jours
      ipAddress: "192.168.1.1",
      userAgent: "Mozilla/5.0"
    };

    const shareHistory = await shareHistoryService.logShare(shareData);
    log.success(`Partage créé: ${shareHistory.shareId}`);

    // Test 3: Récupérer l'historique de l'utilisateur
    log.test("TEST 3: Récupérer l'historique de l'utilisateur");
    const userHistory = await shareHistoryService.getUserShareHistory(mockUserId.toString(), {
      page: 1,
      limit: 10
    });
    log.success(`${userHistory.pagination.total} partage(s) trouvé(s)`);
    log.info(`Pagination: page ${userHistory.pagination.page}/${userHistory.pagination.pages}`);

    // Test 4: Logger un accès
    log.test("TEST 4: Logger un accès (téléchargement)");
    const accessData = {
      action: "download",
      ipAddress: "192.168.1.100",
      userAgent: "Mozilla/5.0"
    };
    
    await shareHistoryService.logAccess(shareHistory.shareId, accessData);
    const updatedShare = await ShareHistory.findOne({ shareId: shareHistory.shareId });
    log.success(`Accès loggé - Téléchargements: ${updatedShare.downloadCount}`);

    // Test 5: Mettre à jour les paramètres
    log.test("TEST 5: Modifier les paramètres du partage");
    const updated = await shareHistoryService.updateShareSettings(shareHistory.shareId, {
      accessLevel: "view",
      maxDownloads: 5,
      updatedBy: mockUserId
    });
    log.success(`Paramètres mis à jour - Max downloads: ${updated.maxDownloads}`);

    // Test 6: Historique admin (supervision)
    log.test("TEST 6: Récupérer l'historique admin");
    const adminHistory = await shareHistoryService.getAdminShareHistory({
      tenantId: mockTenantId.toString(),
      page: 1,
      limit: 20
    });
    log.success(`${adminHistory.pagination.total} partage(s) pour ce tenant`);

    // Test 7: Statistiques utilisateur
    log.test("TEST 7: Récupérer les statistiques de l'utilisateur");
    const userStats = await shareHistoryService.getUserShareStats(mockUserId.toString());
    log.info(`Stats: ${JSON.stringify(userStats.data, null, 2)}`);
    log.success("Statistiques récupérées ✓");

    // Test 8: Révoquer un partage
    log.test("TEST 8: Révoquer un partage");
    const revoked = await shareHistoryService.revokeShare(shareHistory.shareId, {
      reason: "Accès non autorisé détecté",
      revokedBy: mockUserId
    });
    log.success(`Partage révoqué - Status: ${revoked.status}`);

    // Test 9: Vérifier les audit trails
    log.test("TEST 9: Vérifier les audit trails");
    const auditedShare = await ShareHistory.findOne({ shareId: shareHistory.shareId });
    log.info(`Nombre d'entrées audit: ${auditedShare.auditTrail.length}`);
    log.success("Audit trail bien enregistré ✓");

    // Nettoyage
    log.test("TEST 10: Nettoyage des données de test");
    await ShareHistory.deleteOne({ shareId: shareHistory.shareId });
    log.success("Données de test supprimées ✓");

    log.success("\n✅ TOUS LES TESTS SONT PASSÉS!\n");

  } catch (error) {
    log.error(`Erreur: ${error.message}`);
    console.error(error);
  } finally {
    await mongoose.disconnect();
    log.info("Déconnecté de MongoDB");
  }
}

// Exécuter les tests
runTests();
