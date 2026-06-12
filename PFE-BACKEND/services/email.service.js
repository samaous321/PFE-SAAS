import nodemailer from "nodemailer";
import dotenv from "dotenv";
import dns from "node:dns";

// Load environment variables
dotenv.config();

dns.setDefaultResultOrder("ipv4first");

/**
 * Initialize email transporter with environment variables
 */
const initializeTransporter = () => {
  const emailUser = process.env.EMAIL_USER;
  const emailPass = process.env.EMAIL_PASS;

  console.log(`[Email Service] Initializing with EMAIL_USER: ${emailUser ? 'configured' : 'missing'}`);
  console.log(`[Email Service] Initializing with EMAIL_PASS: ${emailPass ? 'configured' : 'missing'}`);

  if (!emailUser || !emailPass) {
    console.warn("[Email Service] Email configuration missing - notifications will be skipped");
    return null;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_SMTP_HOST || "smtp.gmail.com",
      port: parseInt(process.env.EMAIL_SMTP_PORT || "465", 10),
      secure: process.env.EMAIL_SMTP_SECURE !== "false",
      family: 4,
      auth: {
        user: emailUser,
        pass: emailPass
      }
    });

    if (process.env.EMAIL_VERIFY_ON_STARTUP === "true") {
      transporter.verify((error) => {
        if (error) {
          console.warn("[Email Service] Transporter verification warning:", error.message);
        } else {
          console.log("[Email Service] ✅ Transporter is ready to send emails");
        }
      });
    }

    return transporter;
  } catch (error) {
    console.error("[Email Service] Failed to create transporter:", error.message);
    return null;
  }
};

const transporter = initializeTransporter();

/**
 * Generate HTML template for file share notification
 */
const generateShareNotificationHTML = (shareData) => {
  const {
    senderName,
    senderEmail,
    tenantName,
    recipientName,
    fileName,
    fileType,
    fileSize,
    shareLink,
    note,
    subject,
    expiresAt,
    accessLevel
  } = shareData;

  // Format file size in readable format
  const formatFileSize = (bytes) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  // Format expiration date
  const formatDate = (date) => {
    if (!date) return "No expiration";
    return new Date(date).toLocaleDateString("fr-FR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  return `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body {
          font-family: 'Arial', sans-serif;
          background-color: #f5f5f5;
          margin: 0;
          padding: 0;
        }
        .email-container {
          max-width: 600px;
          margin: 20px auto;
          background-color: #ffffff;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          overflow: hidden;
        }
        .header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 30px;
          text-align: center;
        }
        .header h1 {
          margin: 0;
          font-size: 24px;
          font-weight: bold;
        }
        .content {
          padding: 30px;
        }
        .greeting {
          font-size: 16px;
          color: #333;
          margin-bottom: 20px;
        }
        .file-info {
          background-color: #f9f9f9;
          border-left: 4px solid #667eea;
          padding: 15px;
          margin: 20px 0;
          border-radius: 4px;
        }
        .file-info-row {
          margin: 10px 0;
          font-size: 14px;
          color: #555;
        }
        .file-info-label {
          font-weight: bold;
          color: #333;
          display: inline-block;
          min-width: 120px;
        }
        .file-info-value {
          color: #666;
          word-break: break-all;
        }
        .file-info-header {
          font-size: 16px;
          font-weight: bold;
          color: #333;
          margin-bottom: 15px;
          padding-bottom: 8px;
          border-bottom: 2px solid #667eea;
        }
        .sender-info {
          background-color: #f8f9fa;
          border: 1px solid #e9ecef;
          border-radius: 6px;
          padding: 15px;
          margin: 20px 0;
        }
        .sender-info-header {
          font-size: 16px;
          font-weight: bold;
          color: #495057;
          margin-bottom: 12px;
          padding-bottom: 8px;
          border-bottom: 2px solid #6c757d;
        }
        .sender-info-row {
          margin-bottom: 8px;
        }
        .sender-info-label {
          font-weight: bold;
          color: #495057;
          display: inline-block;
          min-width: 100px;
        }
        .sender-info-value {
          color: #6c757d;
        }
        .note-section {
          background-color: #fff3cd;
          border-left: 4px solid #ffc107;
          padding: 15px;
          margin: 20px 0;
          border-radius: 4px;
        }
        .note-label {
          font-weight: bold;
          color: #856404;
          margin-bottom: 8px;
        }
        .note-content {
          color: #856404;
          font-size: 14px;
          line-height: 1.5;
        }
        .cta-button {
          display: inline-block;
          background-color: #667eea;
          color: white;
          padding: 12px 30px;
          text-decoration: none;
          border-radius: 4px;
          font-weight: bold;
          margin: 20px 0;
          transition: background-color 0.3s;
        }
        .cta-button:hover {
          background-color: #764ba2;
        }
        .footer {
          background-color: #f5f5f5;
          padding: 20px;
          text-align: center;
          font-size: 12px;
          color: #999;
          border-top: 1px solid #e0e0e0;
        }
        .expiration-warning {
          color: #d32f2f;
          font-size: 13px;
          font-weight: bold;
          margin-top: 10px;
        }
        .access-level-badge {
          display: inline-block;
          background-color: #e0e0e0;
          color: #333;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
          margin-left: 10px;
        }
      </style>
    </head>
    <body>
      <div class="email-container">
        <div class="header">
          <h1>📁 Nouveau fichier partagé</h1>
        </div>
        
        <div class="content">
          <div class="greeting">
            Bonjour ${recipientName || "Utilisateur"},
          </div>
          
          <p><strong>${senderName}</strong> (${senderEmail}) de <strong>${tenantName}</strong> a partagé un fichier avec vous.</p>
          
          <!-- Informations de l'expéditeur -->
          <div class="sender-info">
            <div class="sender-info-header">📤 Informations de l'expéditeur</div>
            <div class="sender-info-content">
              <div class="sender-info-row">
                <span class="sender-info-label">👤 Nom:</span>
                <span class="sender-info-value">${senderName}</span>
              </div>
              <div class="sender-info-row">
                <span class="sender-info-label">📧 Email:</span>
                <span class="sender-info-value">${senderEmail}</span>
              </div>
              <div class="sender-info-row">
                <span class="sender-info-label">🏢 Organisation:</span>
                <span class="sender-info-value">${tenantName}</span>
              </div>
            </div>
          </div>
          
          <div class="file-info">
            <div class="file-info-header">📁 Détails du fichier</div>
            <div class="file-info-row">
              <span class="file-info-label">📄 Nom:</span>
              <span class="file-info-value">${fileName}</span>
            </div>
            <div class="file-info-row">
              <span class="file-info-label">📊 Type:</span>
              <span class="file-info-value">${fileType || "N/A"} <span class="access-level-badge">${accessLevel}</span></span>
            </div>
            <div class="file-info-row">
              <span class="file-info-label">💾 Taille:</span>
              <span class="file-info-value">${formatFileSize(fileSize)}</span>
            </div>
            <div class="file-info-row">
              <span class="file-info-label">⏰ Expiration:</span>
              <span class="file-info-value">${formatDate(expiresAt)}</span>
              ${expiresAt && new Date(expiresAt) < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) ? '<div class="expiration-warning">⚠️ Disponible pendant moins d\'une semaine</div>' : ''}
            </div>
          </div>
          
          ${note ? `
            <div class="note-section">
              <div class="note-label">💬 Message du partage:</div>
              <div class="note-content">${note}</div>
            </div>
          ` : ''}
          
          <div style="text-align: center;">
            <a href="${shareLink}" class="cta-button">🔗 Accéder au fichier</a>
          </div>
          
          <p style="font-size: 13px; color: #999;">
            Vous pouvez consulter ce fichier directement dans votre espace utilisateur via le lien ci-dessus.
          </p>
        </div>
        
        <div class="footer">
          <p>Ce message a été envoyé automatiquement par le système de partage de fichiers.</p>
          <p>Ne pas répondre à cet email directement.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

/**
 * Send file share notification email
 */
export const sendShareNotificationEmail = async (shareData) => {
  try {
    if (!transporter) {
      console.warn("[Email Service] Email transporter not initialized - skipping notification");
      return {
        success: false,
        message: "Email service not configured"
      };
    }

    const {
      recipientEmail,
      senderName,
      senderEmail,
      tenantName,
      recipientName,
      fileName,
      fileType,
      fileSize,
      shareLink,
      note,
      subject,
      expiresAt,
      accessLevel
    } = shareData;

    // Validate required fields
    if (!recipientEmail || !senderName || !fileName || !shareLink) {
      throw new Error("Missing required fields for email notification");
    }

    const htmlContent = generateShareNotificationHTML({
      senderName,
      senderEmail,
      tenantName,
      recipientName,
      fileName,
      fileType,
      fileSize,
      shareLink,
      note,
      subject,
      expiresAt,
      accessLevel
    });

    const emailSubject = subject || `${senderName} a partagé "${fileName}" avec vous`;

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: recipientEmail,
      subject: emailSubject,
      html: htmlContent,
      replyTo: senderEmail
    };

    const info = await transporter.sendMail(mailOptions);

    console.log(`[Email Service] ✅ Share notification sent to ${recipientEmail} - Message ID: ${info.messageId}`);

    return {
      success: true,
      message: "Email sent successfully",
      messageId: info.messageId
    };
  } catch (error) {
    console.error("[Email Service] Error sending share notification:", error.message);
    return {
      success: false,
      message: error.message,
      error: error
    };
  }
};

/**
 * Send multiple notifications (for bulk shares)
 */
export const sendBulkShareNotifications = async (recipients, shareData) => {
  try {
    if (!transporter) {
      console.warn("[Email Service] Email transporter not initialized");
      return { success: false, message: "Email service not configured" };
    }

    const results = [];

    for (const recipient of recipients) {
      const result = await sendShareNotificationEmail({
        ...shareData,
        recipientEmail: recipient.email,
        recipientName: recipient.name || recipient.email
      });
      results.push({
        email: recipient.email,
        success: result.success,
        messageId: result.messageId
      });
    }

    return {
      success: true,
      message: `Sent ${results.filter(r => r.success).length} of ${recipients.length} emails`,
      results
    };
  } catch (error) {
    console.error("[Email Service] Error sending bulk notifications:", error.message);
    return {
      success: false,
      message: error.message,
      results: []
    };
  }
};

/**
 * Test email service
 */
export const testEmailService = async () => {
  try {
    if (!transporter) {
      return { success: false, message: "Email service not configured" };
    }

    await transporter.verify();
    console.log("[Email Service] ✅ Connection verified");

    return {
      success: true,
      message: "Email service is properly configured and connected"
    };
  } catch (error) {
    console.error("[Email Service] Connection test failed:", error.message);
    return {
      success: false,
      message: error.message
    };
  }
};

/**
 * Send security alert notification to admin
 */
export const sendSecurityAlertEmail = async (alertData) => {
  if (!transporter) {
    console.warn("[Email Service] Email transporter not configured - skipping security alert");
    return { success: false, message: "Email service not configured" };
  }

  try {
    const {
      adminEmail,
      fileName,
      ownerName,
      tenantName,
      threatLevel,
      detectionSource,
      viruses = [],
      fileSize,
      uploadTime
    } = alertData;

    const threatColors = {
      critical: '#dc2626',
      high: '#ea580c',
      medium: '#f59e0b',
      low: '#10b981'
    };

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Alerte de sécurité - Fichier suspect détecté</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { background: ${threatColors[threatLevel] || '#dc2626'}; color: white; padding: 20px; text-align: center; }
          .content { padding: 30px; }
          .alert-badge { display: inline-block; padding: 8px 16px; background: ${threatColors[threatLevel] || '#dc2626'}; color: white; border-radius: 20px; font-weight: bold; text-transform: uppercase; font-size: 12px; }
          .detail-row { margin: 15px 0; padding: 10px; background: #f8f9fa; border-radius: 4px; }
          .detail-label { font-weight: bold; color: #333; }
          .detail-value { color: #666; }
          .action-button { display: inline-block; padding: 12px 24px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🚨 Alerte de sécurité</h1>
            <p>Fichier suspect détecté et mis en quarantaine</p>
          </div>

          <div class="content">
            <p>Un fichier potentiellement malveillant a été détecté lors du téléversement et a été automatiquement mis en quarantaine.</p>

            <div style="text-align: center; margin: 20px 0;">
              <span class="alert-badge">${threatLevel.toUpperCase()}</span>
            </div>

            <div class="detail-row">
              <span class="detail-label">Fichier:</span>
              <span class="detail-value">${fileName}</span>
            </div>

            <div class="detail-row">
              <span class="detail-label">Propriétaire:</span>
              <span class="detail-value">${ownerName}</span>
            </div>

            <div class="detail-row">
              <span class="detail-label">Organisation:</span>
              <span class="detail-value">${tenantName}</span>
            </div>

            <div class="detail-row">
              <span class="detail-label">Taille:</span>
              <span class="detail-value">${fileSize} bytes</span>
            </div>

            <div class="detail-row">
              <span class="detail-label">Détecté par:</span>
              <span class="detail-value">${detectionSource}</span>
            </div>

            ${viruses.length > 0 ? `
            <div class="detail-row">
              <span class="detail-label">Signatures détectées:</span>
              <span class="detail-value">${viruses.join(', ')}</span>
            </div>
            ` : ''}

            <div class="detail-row">
              <span class="detail-label">Date de détection:</span>
              <span class="detail-value">${new Date(uploadTime).toLocaleString('fr-FR')}</span>
            </div>

            <p style="color: #dc2626; font-weight: bold; margin: 20px 0;">
              ⚠️ Ce fichier a été bloqué et mis en quarantaine. Veuillez examiner cette alerte dans le panneau d'administration.
            </p>

            <div style="text-align: center;">
              <a href="${process.env.APP_URL || 'http://localhost:3000'}/admin/alerts" class="action-button">
                Voir les alertes
              </a>
            </div>
          </div>

          <div class="footer">
            <p>Cette notification a été générée automatiquement par le système de sécurité.</p>
            <p>Ne répondez pas à cet email.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: adminEmail,
      subject: `🚨 Alerte sécurité: Fichier suspect détecté - ${fileName}`,
      html: htmlContent
    };

    const info = await transporter.sendMail(mailOptions);

    console.log(`[Email Service] ✅ Security alert sent to ${adminEmail} - Message ID: ${info.messageId}`);

    return {
      success: true,
      message: "Security alert email sent successfully",
      messageId: info.messageId
    };
  } catch (error) {
    console.error("[Email Service] Error sending security alert:", error.message);
    return {
      success: false,
      message: error.message,
      error: error
    };
  }
};

const complaintEmailLayout = ({ title, intro, detailsHtml, actionUrl, actionLabel }) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 620px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.08); }
        .header { background: #0f766e; color: #fff; padding: 20px; }
        .content { padding: 24px; color: #1f2937; }
        .row { margin: 10px 0; padding: 10px 12px; background: #f8fafc; border-radius: 6px; }
        .label { font-weight: bold; color: #111827; }
        .button { display: inline-block; margin-top: 14px; padding: 10px 16px; background: #0f766e; color: #fff; text-decoration: none; border-radius: 6px; }
        .footer { background: #f8fafc; color: #6b7280; font-size: 12px; padding: 16px 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2 style="margin:0;">${title}</h2>
        </div>
        <div class="content">
          <p>${intro}</p>
          ${detailsHtml}
          ${actionUrl ? `<a class="button" href="${actionUrl}">${actionLabel || "Voir la reclamation"}</a>` : ""}
        </div>
        <div class="footer">
          Notification automatique du module Reclamation. Merci de ne pas repondre a cet email.
        </div>
      </div>
    </body>
    </html>
  `;
};

const sendComplaintEmail = async ({ to, subject, html }) => {
  if (!transporter) {
    console.warn("[Email Service] Email transporter not configured - skipping complaint notification");
    return { success: false, message: "Email service not configured" };
  }

  if (!to || !subject || !html) {
    throw new Error("Missing required fields for complaint email");
  }

  const info = await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to,
    subject,
    html,
  });

  return {
    success: true,
    message: "Complaint email sent successfully",
    messageId: info.messageId,
  };
};

export const sendComplaintCreatedEmail = async (data) => {
  try {
    const {
      recipientEmail,
      recipientName,
      ticketId,
      complaintSubject,
      category,
      priority,
      status,
      requesterName,
      appUrl,
      forAdmin,
    } = data;

    const subject = forAdmin
      ? `[Reclamation] Nouveau ticket ${ticketId}`
      : `[Reclamation] Ticket cree ${ticketId}`;

    const intro = forAdmin
      ? `Bonjour ${recipientName || "Admin"}, une nouvelle reclamation a ete soumise.`
      : `Bonjour ${recipientName || "Utilisateur"}, votre reclamation a bien ete enregistree.`;

    const html = complaintEmailLayout({
      title: "Nouvelle reclamation",
      intro,
      detailsHtml: `
        <div class="row"><span class="label">Ticket:</span> ${ticketId}</div>
        <div class="row"><span class="label">Sujet:</span> ${complaintSubject}</div>
        <div class="row"><span class="label">Categorie:</span> ${category}</div>
        <div class="row"><span class="label">Priorite:</span> ${priority}</div>
        <div class="row"><span class="label">Statut:</span> ${status}</div>
        ${requesterName ? `<div class="row"><span class="label">Demandeur:</span> ${requesterName}</div>` : ""}
      `,
      actionUrl: appUrl,
      actionLabel: "Ouvrir le ticket",
    });

    const result = await sendComplaintEmail({
      to: recipientEmail,
      subject,
      html,
    });

    console.log(`[Email Service] Complaint creation email sent to ${recipientEmail}`);
    return result;
  } catch (error) {
    console.error("[Email Service] Error sending complaint creation email:", error.message);
    return { success: false, message: error.message, error };
  }
};

export const sendComplaintAssignedEmail = async (data) => {
  try {
    const {
      recipientEmail,
      recipientName,
      ticketId,
      complaintSubject,
      requesterName,
      priority,
      status,
      appUrl,
    } = data;

    const html = complaintEmailLayout({
      title: "Reclamation assignee",
      intro: `Bonjour ${recipientName || "Admin"}, une reclamation vous a ete assignee.`,
      detailsHtml: `
        <div class="row"><span class="label">Ticket:</span> ${ticketId}</div>
        <div class="row"><span class="label">Sujet:</span> ${complaintSubject}</div>
        <div class="row"><span class="label">Demandeur:</span> ${requesterName || "N/A"}</div>
        <div class="row"><span class="label">Priorite:</span> ${priority}</div>
        <div class="row"><span class="label">Statut:</span> ${status}</div>
      `,
      actionUrl: appUrl,
      actionLabel: "Traiter la reclamation",
    });

    const result = await sendComplaintEmail({
      to: recipientEmail,
      subject: `[Reclamation] Ticket assigne ${ticketId}`,
      html,
    });

    console.log(`[Email Service] Complaint assignment email sent to ${recipientEmail}`);
    return result;
  } catch (error) {
    console.error("[Email Service] Error sending complaint assignment email:", error.message);
    return { success: false, message: error.message, error };
  }
};

export const sendComplaintResolvedEmail = async (data) => {
  try {
    const {
      recipientEmail,
      recipientName,
      ticketId,
      complaintSubject,
      resolutionNote,
      status,
      appUrl,
    } = data;

    const html = complaintEmailLayout({
      title: "Reclamation resolue",
      intro: `Bonjour ${recipientName || "Utilisateur"}, votre reclamation a ete mise a jour.`,
      detailsHtml: `
        <div class="row"><span class="label">Ticket:</span> ${ticketId}</div>
        <div class="row"><span class="label">Sujet:</span> ${complaintSubject}</div>
        <div class="row"><span class="label">Nouveau statut:</span> ${status}</div>
        ${resolutionNote ? `<div class="row"><span class="label">Note:</span> ${resolutionNote}</div>` : ""}
      `,
      actionUrl: appUrl,
      actionLabel: "Consulter la reclamation",
    });

    const result = await sendComplaintEmail({
      to: recipientEmail,
      subject: `[Reclamation] Ticket ${ticketId} ${status}`,
      html,
    });

    console.log(`[Email Service] Complaint resolution email sent to ${recipientEmail}`);
    return result;
  } catch (error) {
    console.error("[Email Service] Error sending complaint resolution email:", error.message);
    return { success: false, message: error.message, error };
  }
};

export default {
  sendShareNotificationEmail,
  sendBulkShareNotifications,
  testEmailService,
  sendComplaintCreatedEmail,
  sendComplaintAssignedEmail,
  sendComplaintResolvedEmail,
};
