/**
 * 📖 EXEMPLE D'INTÉGRATION IA DANS ROUTES
 * 
 * Ce fichier montre comment intégrer le service IA
 * dans vos routes existantes (sans casser le code current)
 */

// ============================================
// EXEMPLE 1: CLASSIER UN DOCUMENT À L'UPLOAD
// ============================================

// routes/file.routes.js - AJOUTER À votre route POST /upload

import aiService from '../services/ai-ollama.service.js';
import File from '../models/File.js';

export const exampleUploadWithAI = async (requester, file, buffer) => {
  // 1. Upload standard (BLOQUANT - existant)
  const validationReport = validateFile(
    file.originalname,
    file.mimetype,
    buffer
  );

  if (!validationReport.isValid) {
    throw new Error(`File validation failed`);
  }

  // ... [autres étapes: quota check, ClamAV scan, chiffrement, upload MinIO]

  const fileRecord = new File({
    tenantId: requester.tenantId,
    ownerId: requester.userId,
    originalname: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
    status: 'active'
  });

  await fileRecord.save();

  // 2. 🤖 IA CLASSIFICATION (NON-BLOQUANT - NOUVEAU)
  // Ceci s'exécute EN PARALLÈLE sans ralentir l'upload
  if (process.env.AI_ENABLED === 'true') {
    Promise.resolve().then(async () => {
      try {
        console.log(`[AI] Starting document classification for: ${file.originalname}`);

        // Extraire un échantillon du fichier pour analyse
        const sampleText = await extractTextFromFile(buffer);

        // Appeler le service IA
        const classification = await aiService.classifyDocumentSensitivity(
          {
            filename: file.originalname,
            mimetype: file.mimetype,
            size: file.size,
            fileId: fileRecord._id
          },
          sampleText
        );

        // Sauvegarder les résultats
        if (classification && !classification.error) {
          await File.updateOne(
            { _id: fileRecord._id },
            {
              // Résultats IA
              aiClassification: classification.classification,
              piiDetected: classification.detected_pii || [],
              aiConfidence: classification.confidence,
              piiRisk: classification.pii_risk,
              aiReasoning: classification.reasoning,
              
              // Appliquer automatiquement les protections
              requiresEncryption: classification.classification !== 'PUBLIC',
              sensitivityLevel: classification.classification,
              lastAIAnalysis: new Date()
            }
          );

          console.log(`[AI] ✅ Classification complete: ${classification.classification}`);
          
          // Alerter admin si données sensibles détectées
          if (classification.pii_risk === 'HIGH') {
            await notifySecurityTeam({
              type: 'HIGH_RISK_PII_DETECTED',
              fileId: fileRecord._id,
              fileName: file.originalname,
              piiTypes: classification.detected_pii,
              userId: requester.userId
            });
          }
        }
      } catch (error) {
        // Logging sans bloquer
        console.warn(`[AI] Classification failed (non-blocking): ${error.message}`);
      }
    });
  }

  // 3. Retourner immédiatement (sans attendre IA)
  return {
    fileId: fileRecord._id,
    message: 'File uploaded successfully',
    aiClassificationPending: process.env.AI_ENABLED === 'true'
  };
};


// ============================================
// EXEMPLE 2: DÉTECTER ANOMALIES AU LOGIN
// ============================================

export const exampleLoginWithAnomalyDetection = async (email, password) => {
  // 1. Login standard (BLOQUANT)
  const user = await User.findOne({ email });

  if (!user || !await user.verifyPassword(password)) {
    // Log failed attempt
    await SecurityAudit.create({
      eventType: 'LOGIN_FAILED',
      userId: user?.id,
      ip: req.ip,
      timestamp: new Date()
    });
    
    throw new Error('Invalid credentials');
  }

  // Générer le JWT
  const token = generateJWT(user);

  // 2. 🤖 ANOMALY DETECTION (NON-BLOQUANT - NOUVEAU)
  if (process.env.AI_ENABLED === 'true') {
    Promise.resolve().then(async () => {
      try {
        console.log(`[AI] Analyzing access patterns for user: ${user._id}`);

        // Récupérer historique d'accès
        const accessHistory = await SecurityAudit.find({
          userId: user._id,
          eventType: 'LOGIN_SUCCESSFUL'
        })
          .sort({ timestamp: -1 })
          .limit(20)
          .lean();

        // Analyser avec IA
        const anomalyAnalysis = await aiService.detectAccessAnomalies(
          user._id,
          accessHistory
        );

        // Si anomalie détectée
        if (anomalyAnalysis.anomalies_detected && anomalyAnalysis.confidence > 70) {
          console.warn(`[SECURITY] 🚨 Anomaly detected for ${email}:`, anomalyAnalysis.issues);

          // Actions possibles:
          // 1. Envoyer alerte à l'utilisateur
          await sendSecurityAlertEmail(user.email, {
            type: 'ANOMALOUS_ACCESS',
            issues: anomalyAnalysis.issues,
            recommendation: anomalyAnalysis.recommendation
          });

          // 2. Notifier admin
          await notifySecurityTeam({
            type: 'ANOMALOUS_LOGIN',
            userId: user._id,
            email: user.email,
            analysis: anomalyAnalysis
          });

          // 3. (Optionnel) Exiger 2FA supplémentaire
          // user.requireExtraMFA = true;
          // await user.save();

          // 4. Logger pour audit
          await SecurityAudit.create({
            eventType: 'ANOMALY_DETECTED',
            userId: user._id,
            anomalyType: anomalyAnalysis.issues[0],
            ip: req.ip,
            timestamp: new Date(),
            confidence: anomalyAnalysis.confidence
          });
        }
      } catch (error) {
        console.warn(`[AI] Anomaly detection failed (non-blocking): ${error.message}`);
      }
    });
  }

  // 3. Retourner login réussi (sans attendre IA)
  return {
    token,
    user: {
      id: user._id,
      email: user.email,
      role: user.role
    },
    anomalyCheckPending: process.env.AI_ENABLED === 'true'
  };
};


// ============================================
// EXEMPLE 3: DÉTECTER PARTAGE SUSPECT
// ============================================

export const exampleShareWithSuspiciousDetection = async (requester, fileId, recipientEmail) => {
  // 1. Créer le partage (BLOQUANT)
  const file = await File.findById(fileId);
  
  if (!file) {
    throw new Error('File not found');
  }

  const shareRecord = await SharedLink.create({
    fileId,
    tokenHash: hashToken(crypto.randomBytes(32).toString('hex')),
    recipientEmail,
    createdBy: requester.userId,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  });

  // 2. 🤖 SUSPICIOUS SHARING DETECTION (NON-BLOQUANT - NOUVEAU)
  if (process.env.AI_ENABLED === 'true') {
    Promise.resolve().then(async () => {
      try {
        console.log(`[AI] Analyzing sharing activity for user: ${requester.userId}`);

        // Récupérer activité de partage récente
        const recentShares = await SharedLink.find({
          createdBy: requester.userId,
          createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        })
          .populate('fileId')
          .lean();

        // Préparer données pour analyse
        const shareActivity = {
          totalShares: recentShares.length,
          uniqueFiles: new Set(recentShares.map(s => s.fileId._id.toString())).size,
          externalRecipients: recentShares.filter(s => !s.recipientEmail.endsWith('@company.com')).length,
          recentShares: recentShares.slice(0, 5).map(s => ({
            filename: s.fileId.originalname,
            recipient: s.recipientEmail,
            classification: s.fileId.aiClassification || 'UNKNOWN'
          }))
        };

        // Analyser avec IA
        const suspiciousAnalysis = await aiService.detectSuspiciousSharing(
          requester.userId,
          shareActivity
        );

        // Si partage suspect
        if (suspiciousAnalysis.is_suspicious && suspiciousAnalysis.risk_score > 75) {
          console.warn(`[SECURITY] ⚠️ Suspicious sharing for user ${requester.userId}`);
          console.warn(`   Concerns:`, suspiciousAnalysis.concerns);

          // Actions basées sur le niveau de risque:
          if (suspiciousAnalysis.action === 'BLOCK') {
            // BLOQUER le partage
            await shareRecord.deleteOne();
            
            throw new Error('Share blocked due to security concerns');
          } 
          else if (suspiciousAnalysis.action === 'REQUIRE_APPROVAL') {
            // Marquer pour approbation admin
            await SharedLink.updateOne(
              { _id: shareRecord._id },
              { requiresAdminApproval: true, approvalReason: suspiciousAnalysis.concerns }
            );

            // Notifier admin
            await notifySecurityTeam({
              type: 'SHARE_REQUIRES_APPROVAL',
              shareId: shareRecord._id,
              userId: requester.userId,
              concerns: suspiciousAnalysis.concerns
            });
          }
          else if (suspiciousAnalysis.action === 'WARN') {
            // Alerter l'utilisateur
            await sendWarningEmail(requester.email, {
              type: 'UNUSUAL_SHARING_PATTERN',
              concerns: suspiciousAnalysis.concerns,
              suggestion: 'Review your recent shares'
            });
          }

          // Logger pour audit
          await SecurityAudit.create({
            eventType: 'SUSPICIOUS_SHARE_DETECTED',
            userId: requester.userId,
            fileId,
            recipientEmail,
            suspiciousScore: suspiciousAnalysis.risk_score,
            concerns: suspiciousAnalysis.concerns,
            timestamp: new Date()
          });
        }
      } catch (error) {
        console.warn(`[AI] Suspicious sharing detection failed (non-blocking): ${error.message}`);
      }
    });
  }

  // 3. Retourner le partage créé (sans attendre IA)
  return {
    shareToken: shareRecord.tokenHash,
    expiresIn: '7 days',
    suspiciousCheckPending: process.env.AI_ENABLED === 'true'
  };
};


// ============================================
// EXEMPLE 4: ANALYSER MALWARE COMPORTEMENTAL
// ============================================

export const exampleAnalyzeMalwareWithAI = async (fileId, virustotalResult) => {
  const file = await File.findById(fileId);

  // 1. Déterminer immédiatement le statut
  if (virustotalResult.detectionCount > 0) {
    file.status = 'quarantined';
    await file.save();
  }

  // 2. 🤖 ANALYZE BEHAVIOR (NON-BLOQUANT - NOUVEAU)
  if (process.env.AI_ENABLED === 'true') {
    Promise.resolve().then(async () => {
      try {
        console.log(`[AI] Analyzing behavioral risks for: ${file.originalname}`);

        const behaviorAnalysis = await aiService.analyzeMalwareBehavior(
          {
            filename: file.originalname,
            mimetype: file.mimetype,
            size: file.size,
            fileId: file._id
          },
          {
            detections: virustotalResult.engines || [],
            detectionCount: virustotalResult.detectionCount || 0
          }
        );

        // Sauvegarder résultats
        await File.updateOne(
          { _id: fileId },
          {
            aiMalwareAnalysis: {
              isMalware: behaviorAnalysis.is_malware,
              threatLevel: behaviorAnalysis.threat_level,
              behaviorScore: behaviorAnalysis.behavior_score,
              detectedBehaviors: behaviorAnalysis.detected_behaviors,
              recommendation: behaviorAnalysis.recommendation,
              analysisDate: new Date()
            }
          }
        );

        // Si malware confirmé, bloquer définitivement
        if (behaviorAnalysis.recommendation === 'BLOCK') {
          await File.updateOne(
            { _id: fileId },
            { status: 'blocked' }
          );

          console.error(`[MALWARE] 🚫 File permanently blocked: ${file.originalname}`);
        }
      } catch (error) {
        console.warn(`[AI] Malware behavior analysis failed: ${error.message}`);
      }
    });
  }
};


// ============================================
// HELPER: Extraire texte d'un fichier
// ============================================

async function extractTextFromFile(buffer) {
  // Implémentation dépend du type de fichier
  // Pour PDF: use pdfkit, pdf-parse
  // Pour DOCX: use docx, mammoth
  // Pour texte: direct
  
  try {
    // Cas simple: fichier texte
    const text = buffer.toString('utf-8');
    return text.substring(0, 1000); // Limiter à 1000 caractères pour analyse
  } catch (error) {
    console.warn('Could not extract text:', error.message);
    return null;
  }
}

// Pour PDFs:
// import pdfParse from 'pdf-parse';
// const pdfData = await pdfParse(buffer);
// return pdfData.text.substring(0, 1000);

// Pour DOCX:
// import mammoth from 'mammoth';
// const docData = await mammoth.extractRawText({ buffer });
// return docData.value.substring(0, 1000);


// ============================================
// HELPER: Notifier l'équipe de sécurité
// ============================================

async function notifySecurityTeam(event) {
  try {
    // Envoyer email aux admins
    const admins = await User.find({ role: 'admin' });
    
    for (const admin of admins) {
      await sendSecurityAlertEmail(admin.email, event);
    }

    // Optionnel: WebSocket en temps réel
    // io.to(`security:${tenantId}`).emit('security-event', event);

    console.log(`[SECURITY] Notification sent to ${admins.length} admins`);
  } catch (error) {
    console.error('Failed to notify security team:', error.message);
  }
}


export {
  exampleUploadWithAI,
  exampleLoginWithAnomalyDetection,
  exampleShareWithSuspiciousDetection,
  exampleAnalyzeMalwareWithAI
};
