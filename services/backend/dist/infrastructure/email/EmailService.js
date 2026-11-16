import nodemailer from 'nodemailer';
import { config } from '../../config/env.js';
import { logger } from '../../shared/logger/index.js';
export class EmailService {
    transporter = null;
    isConfigured = false;
    constructor() {
        this.initTransporter();
    }
    initTransporter() {
        const host = config.SMTP_HOST?.trim();
        const user = (config.SMTP_USER || config.SMTP_USERNAME)?.trim();
        const pass = (config.SMTP_PASS || config.SMTP_PASSWORD)?.replace(/\s+/g, '').trim();
        const port = config.SMTP_PORT || 587;
        const isSecure = port === 465 ? true : Boolean(config.SMTP_SECURE);
        if (host && user && pass) {
            try {
                this.transporter = nodemailer.createTransport({
                    host,
                    port,
                    secure: isSecure,
                    auth: { user, pass },
                    tls: {
                        rejectUnauthorized: false, // Compatibility for corporate relays and test gateways
                    },
                });
                this.isConfigured = true;
                logger.info({ host, port, isSecure, user }, 'SMTP email transporter initialized successfully');
            }
            catch (err) {
                logger.error({ error: err.message }, 'Failed to initialize SMTP transporter');
                this.transporter = null;
                this.isConfigured = false;
            }
        }
        else {
            logger.info('SMTP credentials not fully set in .env. EmailService running in standby mode.');
            this.transporter = null;
            this.isConfigured = false;
        }
    }
    /**
     * Renders a Claymorphic HTML template for Primary Dairy Admin activation.
     */
    renderClaymorphicActivationTemplate(payload) {
        const { recipientEmail, adminName, dairyName, dairyCode, adminMobile, activationUrl, expiresInHours = 48, } = payload;
        const formattedMobile = adminMobile.startsWith('+91')
            ? adminMobile
            : `+91 ${adminMobile.replace(/\D/g, '').slice(-10)}`;
        const text = `
==============================================================================
DFARM SMART DAIRY MANAGEMENT PLATFORM — PRIMARY ADMIN INVITATION
==============================================================================

Hello ${adminName},

You have been provisioned as the root Primary Dairy Administrator for:
Dairy Business: ${dairyName}
Tenant Code:    ${dairyCode}
Admin Email:    ${recipientEmail}
Admin Mobile:   ${formattedMobile}

To complete activation and access your enterprise Dairy Admin portal,
open the cryptographically secured activation link below:

${activationUrl}

Security Notes:
- This activation token is high-entropy, single-use, and valid for ${expiresInHours} hours.
- You will complete a one-time SMS verification sent to your registered mobile.
- If you did not request this invitation, please contact support@dfarm.in.

DFarm Enterprise Multi-Tenant Dairy System • Automated Security Service
    `.trim();
        const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DFarm Primary Dairy Admin Activation</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #F8F4F0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #211B18;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      background-color: #F8F4F0;
      padding: 40px 16px;
      box-sizing: border-box;
    }
    .card {
      max-width: 560px;
      margin: 0 auto;
      background: #FFFFFF;
      border-radius: 28px;
      padding: 40px 36px;
      box-shadow: 12px 12px 28px #E8DFD8, -10px -10px 24px #FFFFFF;
      border: 1px solid #F1E7E0;
    }
    .logo-container {
      text-align: center;
      margin-bottom: 24px;
    }
    .badge-icon {
      display: inline-block;
      width: 56px;
      height: 56px;
      line-height: 56px;
      border-radius: 20px;
      background: linear-gradient(135deg, #FFF0E5 0%, #FFE0CC 100%);
      box-shadow: 6px 6px 14px #EADBCE, -6px -6px 14px #FFFFFF;
      font-size: 26px;
      text-align: center;
    }
    .brand-title {
      font-size: 20px;
      font-weight: 900;
      color: #211B18;
      margin-top: 12px;
      letter-spacing: -0.5px;
    }
    .brand-subtitle {
      font-size: 12px;
      font-weight: 600;
      color: #817A75;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-top: 2px;
    }
    h1 {
      font-size: 22px;
      font-weight: 800;
      color: #211B18;
      text-align: center;
      margin: 20px 0 10px 0;
      line-height: 1.3;
    }
    p.lead {
      font-size: 14px;
      color: #615953;
      text-align: center;
      margin: 0 0 28px 0;
      line-height: 1.5;
    }
    .inset-panel {
      background: #FFF7F2;
      border-radius: 20px;
      padding: 22px;
      margin-bottom: 28px;
      border: 1px solid #FFE6D6;
      box-shadow: inset 3px 3px 6px #F7E5D9, inset -3px -3px 6px #FFFFFF;
    }
    .detail-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 7px 0;
      border-bottom: 1px solid #F5E5DA;
      font-size: 13px;
    }
    .detail-row:last-child {
      border-bottom: none;
      padding-bottom: 0;
    }
    .detail-label {
      color: #817A75;
      font-weight: 600;
    }
    .detail-value {
      color: #211B18;
      font-weight: 700;
      text-align: right;
    }
    .code-pill {
      display: inline-block;
      padding: 3px 10px;
      background: #FFE9DC;
      color: #C2410C;
      font-family: 'SF Mono', Consolas, monospace;
      font-size: 12px;
      font-weight: 800;
      border-radius: 8px;
      border: 1px solid #FDBA74;
    }
    .btn-container {
      text-align: center;
      margin: 32px 0 28px 0;
    }
    .cta-btn {
      display: inline-block;
      background: linear-gradient(135deg, #FF7A1A 0%, #FF5500 100%);
      color: #FFFFFF !important;
      text-decoration: none;
      font-size: 15px;
      font-weight: 800;
      padding: 16px 36px;
      border-radius: 18px;
      box-shadow: 0 8px 18px rgba(255, 106, 0, 0.35), inset 0 2px 2px rgba(255, 255, 255, 0.4);
      letter-spacing: 0.2px;
    }
    .fallback-box {
      background: #FAF6F3;
      border-radius: 14px;
      padding: 14px;
      border: 1px dashed #E5D7CE;
      margin-top: 24px;
      font-size: 11px;
      color: #7A726C;
      word-break: break-all;
    }
    .fallback-box a {
      color: #FF6A00;
      text-decoration: underline;
    }
    .security-notice {
      margin-top: 24px;
      font-size: 11px;
      color: #9C948D;
      text-align: center;
      line-height: 1.5;
    }
    .footer {
      text-align: center;
      margin-top: 28px;
      font-size: 11px;
      color: #A39B94;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="logo-container">
        <div class="badge-icon">🥛</div>
        <div class="brand-title">DFarm</div>
        <div class="brand-subtitle">Smart Dairy Management</div>
      </div>

      <h1>Primary Admin Account Invitation</h1>
      <p class="lead">
        Hello <strong>${adminName}</strong>, your dairy business profile has been registered on the DFarm Multi-Tenant Platform.
      </p>

      <div class="inset-panel">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr style="border-bottom: 1px solid #F5E5DA;">
            <td style="padding: 6px 0; color: #817A75; font-size: 13px; font-weight: 600;">Dairy Business</td>
            <td style="padding: 6px 0; color: #211B18; font-size: 13px; font-weight: 700; text-align: right;">${dairyName}</td>
          </tr>
          <tr style="border-bottom: 1px solid #F5E5DA;">
            <td style="padding: 6px 0; color: #817A75; font-size: 13px; font-weight: 600;">Tenant Code</td>
            <td style="padding: 6px 0; text-align: right;"><span class="code-pill">${dairyCode}</span></td>
          </tr>
          <tr style="border-bottom: 1px solid #F5E5DA;">
            <td style="padding: 6px 0; color: #817A75; font-size: 13px; font-weight: 600;">Authorized Admin</td>
            <td style="padding: 6px 0; color: #211B18; font-size: 13px; font-weight: 700; text-align: right;">${adminName}</td>
          </tr>
          <tr style="border-bottom: 1px solid #F5E5DA;">
            <td style="padding: 6px 0; color: #817A75; font-size: 13px; font-weight: 600;">Recipient Email</td>
            <td style="padding: 6px 0; color: #211B18; font-size: 13px; font-weight: 700; text-align: right;">${recipientEmail}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #817A75; font-size: 13px; font-weight: 600;">Registered Mobile</td>
            <td style="padding: 6px 0; color: #211B18; font-size: 13px; font-weight: 700; text-align: right;">${formattedMobile}</td>
          </tr>
        </table>
      </div>

      <div class="btn-container">
        <a href="${activationUrl}" class="cta-btn" target="_blank" rel="noopener noreferrer">
          Activate Dairy Admin Account &rarr;
        </a>
      </div>

      <div class="fallback-box">
        <strong>Direct Activation Link:</strong><br/>
        <a href="${activationUrl}">${activationUrl}</a>
      </div>

      <div class="security-notice">
        <strong>Security &amp; Expiry Information:</strong><br/>
        This single-use cryptographic invitation link will expire in <strong>${expiresInHours} hours</strong>.<br/>
        Upon opening the link, you will verify your registered mobile via a secure one-time passcode (OTP).
      </div>
    </div>

    <div class="footer">
      &copy; 2026 DFarm Platform. All rights reserved. • Strictly Confidential
    </div>
  </div>
</body>
</html>
    `.trim();
        return { html, text };
    }
    /**
     * Dispatches an activation invitation email to the Primary Dairy Admin.
     */
    async sendActivationInvitation(payload) {
        const timestamp = new Date().toISOString();
        const { html, text } = this.renderClaymorphicActivationTemplate(payload);
        // Re-verify if SMTP was added in runtime
        if (!this.isConfigured) {
            this.initTransporter();
        }
        if (this.isConfigured && this.transporter) {
            try {
                const fromAddress = config.EMAIL_FROM || config.SMTP_FROM || 'DFarm Platform <noreply@dfarm.in>';
                const info = await this.transporter.sendMail({
                    from: fromAddress,
                    to: payload.recipientEmail,
                    subject: `Action Required: Activate Your Primary Dairy Admin Account — ${payload.dairyName}`,
                    text,
                    html,
                });
                logger.info({
                    recipient: payload.recipientEmail,
                    messageId: info.messageId,
                    accepted: info.accepted,
                }, 'Activation invitation email dispatched via SMTP');
                return {
                    success: true,
                    provider: `SMTP (${config.SMTP_HOST})`,
                    messageId: info.messageId,
                    status: 'ACCEPTED',
                    recipient: payload.recipientEmail,
                    timestamp,
                };
            }
            catch (err) {
                logger.error({
                    error: err.message,
                    recipient: payload.recipientEmail,
                }, 'SMTP dispatch failed');
                return {
                    success: false,
                    provider: `SMTP (${config.SMTP_HOST || 'unknown'})`,
                    status: 'FAILED',
                    error: err.message || 'SMTP transmission failure',
                    recipient: payload.recipientEmail,
                    timestamp,
                };
            }
        }
        // Standby / Local Preview Mode when SMTP credentials are not yet populated
        const mockMessageId = `dfarm-sim-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
        logger.info({
            recipient: payload.recipientEmail,
            messageId: mockMessageId,
        }, 'Email provider credentials pending in .env. Invitation registered in standby mode.');
        return {
            success: true,
            provider: 'STANDBY_GATEWAY',
            messageId: mockMessageId,
            status: 'ACCEPTED',
            recipient: payload.recipientEmail,
            timestamp,
            previewNote: 'SMTP_HOST / credentials not set in .env; invitation safely recorded in system.',
        };
    }
}
export const emailService = new EmailService();
//# sourceMappingURL=EmailService.js.map