import { EmailService } from '../dist/infrastructure/email/EmailService.js';
import { config } from '../dist/config/env.js';

console.log('--- DFarm EmailService Trial Dispatch Verification ---');
console.log('SMTP_HOST:', config.SMTP_HOST);
console.log('SMTP_PORT:', config.SMTP_PORT);
console.log('SMTP_USER:', config.SMTP_USER);
console.log('SMTP_FROM:', config.SMTP_FROM);

async function main() {
  const emailService = new EmailService();

  const recipient = 'd.farm.expart@gmail.com';
  console.log(`\nDispatching full Claymorphic activation invitation trial to: ${recipient}...`);

  const result = await emailService.sendActivationInvitation({
    recipientEmail: recipient,
    adminName: 'Pankaj Popat Yewale',
    dairyName: 'Shree Krishna Sahakari Dudh Sanstha',
    dairyCode: 'DF-SAN-7082',
    adminMobile: '7755995615',
    activationUrl: 'http://localhost:5174/activate?token=a1b2c3d4e5f678901234567890abcdef1234567890abcdef1234567890abcdef&dairyCode=DF-SAN-7082',
    expiresInHours: 48,
  });

  console.log('\n================ DISPATCH RESULT ================');
  console.log('Success:', result.success);
  console.log('Status:', result.status);
  console.log('Provider:', result.provider);
  console.log('Message ID:', result.messageId);
  console.log('Recipient:', result.recipient);
  console.log('Timestamp:', result.timestamp);
  if (result.error) {
    console.error('Error:', result.error);
  } else {
    console.log('\n>>> CONFIRMATION: Email has been accepted and dispatched to Gmail SMTP! Check inbox. <<<');
  }
}

main().catch(console.error);
