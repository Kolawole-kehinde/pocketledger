import { ConfigService } from '@nestjs/config';
import { BrevoEmailDeliveryProvider } from './brevo-email-delivery.provider.js';

const configService = new ConfigService(process.env);

const provider = new BrevoEmailDeliveryProvider(configService);

const recipient = process.env.TEST_EMAIL_RECIPIENT;

if (!recipient) {
  throw new Error('TEST_EMAIL_RECIPIENT is not configured');
}

try {
  await provider.send({
    to: recipient,
    subject: 'PocketLedger Email Integration Test',
    text: 'Brevo email delivery is working correctly.',
    html: `
      <h2>PocketLedger</h2>
      <p>Brevo email delivery is working correctly.</p>
    `,
  });

  console.log('Email accepted by Brevo.');
} catch (error) {
  console.error('Brevo email delivery failed:', error);
  process.exitCode = 1;
}