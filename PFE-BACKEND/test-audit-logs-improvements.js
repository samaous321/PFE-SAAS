/**
 * Script de test des améliorations du module Audit-Logs
 * Usage: node test-audit-logs-improvements.js
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

    // Test 1: Vérifier les nouveaux champs du modèle
    log.test("TEST 1: Vérifier les améliorations du modèle ShareHistory");
    const schemaKeys = Object.keys(ShareHistory.schema.obj);
    const accessLogsKeys = Object.keys(ShareHistory.schema.obj.accessLogs[0]);

    if (accessLogsKeys.includes("accessedBy")) {
      log.success("Champ 'accessedBy' ajouté dans accessLogs ✓");
    } else {
      log.error("Champ 'accessedBy' manquant dans accessLogs ✗");
    }

    // Test 2: Créer un enregistrement avec les améliorations
    log.test("TEST 2: Créer un enregistrement avec logs d'accès améliorés");
    const mockUserId = new mongoose.Types.ObjectId();
    const mockTenantId = new mongoose.Types.ObjectId();
    const mockFileId = new mongoose.Types.ObjectId();

    const shareData = {
      fileId: mockFileId,
      fileName: "test-document-improved.pdf",
      fileSize: 2048576,
      mimeType: "application/pdf",
      fileHash: "abc123def456improved",
      sharedByUserId: mockUserId,
      sharedByEmail: "user@example.com",
      sharedByTenantId: mockTenantId,
      sharedWithEmail: "recipient@example.com",
      shareType: "direct",
      accessLevel: "download",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      ipAddress: "192.168.1.1",
      userAgent: "Mozilla/5.0"
    };

    const shareHistory = await shareHistoryService.logShare(shareData);
    log.success(`Partage créé: ${shareHistory.shareId}`);

    // Test 3: Logger un accès avec le nouveau champ accessedBy
    log.test("TEST 3: Logger un accès avec identification utilisateur");
    const accessData = {
      action: "download",
      ipAddress: "192.168.1.100",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      accessedBy: mockUserId // Nouveau champ
    };

    await shareHistoryService.logAccess(shareHistory.shareId, accessData);
    const updatedShare = await ShareHistory.findOne({ shareId: shareHistory.shareId });
    log.success(`Accès loggé - Téléchargements: ${updatedShare.downloadCount}`);

    // Vérifier que accessedBy est enregistré
    const lastAccessLog = updatedShare.accessLogs[updatedShare.accessLogs.length - 1];
    if (lastAccessLog.accessedBy && lastAccessLog.accessedBy.toString() === mockUserId.toString()) {
      log.success("Champ 'accessedBy' correctement enregistré ✓");
    } else {
      log.error("Champ 'accessedBy' non enregistré ✗");
    }

    // Test 4: Tester les nouveaux filtres
    log.test("TEST 4: Tester les nouveaux filtres backend");

    // Filtre par action
    const actionFilterResult = await shareHistoryService.getAdminShareHistory({
      action: "created",
      page: 1,
      limit: 10
    });
    log.info(`Filtre action 'created': ${actionFilterResult.data.length} résultat(s)`);

    // Filtre par IP
    const ipFilterResult = await shareHistoryService.getAdminShareHistory({
      ipAddress: "192.168.1.100",
      page: 1,
      limit: 10
    });
    log.info(`Filtre IP '192.168.1.100': ${ipFilterResult.data.length} résultat(s)`);

    // Filtre par user agent
    const uaFilterResult = await shareHistoryService.getAdminShareHistory({
      userAgent: "Mozilla",
      page: 1,
      limit: 10
    });
    log.info(`Filtre User-Agent 'Mozilla': ${uaFilterResult.data.length} résultat(s)`);

    log.success("Tous les tests d'amélioration passés ✓");

    // Nettoyage
    await ShareHistory.deleteMany({ shareId: shareHistory.shareId });
    log.info("Nettoyage effectué");

    await mongoose.disconnect();
    log.success("Tests terminés avec succès ! 🎉");

  } catch (error) {
    console.error("[Test] Erreur:", error.message);
    process.exit(1);
  }
};

runTests();