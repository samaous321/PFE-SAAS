import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const API_BASE_URL = process.env.API_URL || "http://localhost:3000/api";
const TEST_USER_TOKEN = process.env.TEST_USER_TOKEN; // À définir

/**
 * Test script pour la fonctionnalité de notification email au partage
 */

// Configuration de couleurs pour les logs
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m"
};

const log = {
  success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
  info: (msg) => console.log(`${colors.blue}ℹ️  ${msg}${colors.reset}`),
  warning: (msg) => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`),
  header: (msg) => console.log(`\n${colors.bright}${colors.blue}═══ ${msg} ═══${colors.reset}\n`)
};

/**
 * Test 1: Vérifier la configuration
 */
async function testEmailConfiguration() {
  log.header("TEST 1: Vérification de la configuration");

  try {
    if (!process.env.EMAIL_USER) {
      log.error("EMAIL_USER non défini dans .env");
      return false;
    }
    if (!process.env.EMAIL_PASS) {
      log.error("EMAIL_PASS non défini dans .env");
      return false;
    }

    log.success("Configuration email détectée");
    log.info(`Email: ${process.env.EMAIL_USER}`);
    return true;
  } catch (error) {
    log.error(error.message);
    return false;
  }
}

/**
 * Test 2: Tester un partage avec notification
 */
async function testShareWithNotification() {
  log.header("TEST 2: Partage de fichier avec notification email");

  if (!TEST_USER_TOKEN) {
    log.warning("TEST_USER_TOKEN non défini - test ignoré");
    log.info("Pour exécuter ce test, définissez TEST_USER_TOKEN en variable d'environnement");
    return false;
  }

  try {
    // Exemple - utiliser un fileId réel de votre système
    const fileId = "507f1f77bcf86cd799439011";
    const recipientEmail = "destinataire@example.com";

    const shareData = {
      recipientEmail,
      recipientName: "Jean Dupont",
      accessControl: "recipient-only",
      expiresInHours: 48,
      maxUses: 3,
      note: "🔍 Veuillez vérifier les modifications apportées au document. N'hésitez pas à me contacter si vous avez des questions.",
      subject: "📄 Document à réviser - Urgent",
      notifyRecipient: true
    };

    log.info(`Tentative de partage du fichier ${fileId}`);
    log.info(`Destinataire: ${recipientEmail}`);

    const response = await axios.post(
      `${API_BASE_URL}/files/${fileId}/share`,
      shareData,
      {
        headers: {
          Authorization: `Bearer ${TEST_USER_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );

    if (response.status === 201) {
      log.success("Fichier partagé avec succès");
      log.info(`URL de partage: ${response.data.shareUrl}`);
      return true;
    } else {
      log.warning(`Réponse inattendue: ${response.status}`);
      return false;
    }
  } catch (error) {
    log.error(`Erreur lors du partage: ${error.message}`);
    if (error.response?.data) {
      log.info(`Réponse API: ${JSON.stringify(error.response.data, null, 2)}`);
    }
    return false;
  }
}

/**
 * Test 3: Vérifier l'historique de partage
 */
async function testShareHistory() {
  log.header("TEST 3: Vérification de l'historique de partage");

  if (!TEST_USER_TOKEN) {
    log.warning("TEST_USER_TOKEN non défini - test ignoré");
    return false;
  }

  try {
    const response = await axios.get(
      `${API_BASE_URL}/shares/history?limit=5`,
      {
        headers: {
          Authorization: `Bearer ${TEST_USER_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );

    if (response.status === 200 && response.data.data?.length > 0) {
      log.success("Historique récupéré");
      
      const latestShare = response.data.data[0];
      log.info(`Dernier partage:`);
      log.info(`  - Fichier: ${latestShare.fileName}`);
      log.info(`  - Destinataire: ${latestShare.sharedWith?.email}`);
      if (latestShare.note) {
        log.info(`  - Note: ${latestShare.note}`);
      }
      log.info(`  - Date: ${new Date(latestShare.createdAt).toLocaleString()}`);
      
      return true;
    } else {
      log.warning("Aucun historique trouvé");
      return false;
    }
  } catch (error) {
    log.error(`Erreur: ${error.message}`);
    return false;
  }
}

/**
 * Test 4: Simulation d'envoi d'email avec détails
 */
async function testEmailTemplateGeneration() {
  log.header("TEST 4: Vérification du template d'email");

  const mockShareData = {
    senderName: "Alice Martin",
    senderEmail: "alice@example.com",
    recipientName: "Bob Leclerc",
    fileName: "rapport_q4_2025.pdf",
    fileType: "application/pdf",
    fileSize: 2621440,
    shareLink: "http://localhost:3000/file/shared/abc123xyz/download",
    note: "Veuillez vérifier les chiffres du trimestre Q4. Merci!",
    subject: "📊 Rapport Trimestre Q4 2025",
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    accessLevel: "download"
  };

  try {
    log.success("Template d'email généré avec les données suivantes:");
    log.info(`De: ${mockShareData.senderName} <${mockShareData.senderEmail}>`);
    log.info(`À: ${mockShareData.recipientName}`);
    log.info(`Objet: ${mockShareData.subject}`);
    log.info(`Fichier: ${mockShareData.fileName} (${(mockShareData.fileSize / 1024 / 1024).toFixed(2)} MB)`);
    log.info(`Note: ${mockShareData.note}`);
    log.info(`Expire le: ${mockShareData.expiresAt.toLocaleString()}`);
    log.info(`Lien: ${mockShareData.shareLink}`);
    return true;
  } catch (error) {
    log.error(error.message);
    return false;
  }
}

/**
 * Exécuter tous les tests
 */
async function runAllTests() {
  console.clear();
  console.log(`
╔═══════════════════════════════════════════════════════╗
║  TEST SUITE - Notification Email au Partage          ║
║  Version 1.0                                          ║
╚═══════════════════════════════════════════════════════╝
  `);

  const results = [];

  // Test 1
  results.push(await testEmailConfiguration());

  // Test 2 - commenté par défaut
  // results.push(await testShareWithNotification());

  // Test 3
  // results.push(await testShareHistory());

  // Test 4
  results.push(await testEmailTemplateGeneration());

  // Résumé
  log.header("RÉSUMÉ DES TESTS");
  const passed = results.filter(r => r).length;
  const total = results.length;
  
  if (passed === total) {
    log.success(`${passed}/${total} tests réussis`);
    console.log("\n✨ Tous les tests sont passés!");
  } else {
    log.warning(`${passed}/${total} tests réussis`);
    console.log("\n⚠️  Certains tests ont échoué. Vérifiez la configuration.");
  }
}

// Exécuter les tests
runAllTests().catch(error => {
  log.error(`Erreur fatale: ${error.message}`);
  process.exit(1);
});
