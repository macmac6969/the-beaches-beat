// Central config. Everything is env-overridable so nothing is a one-way door.
// The physical postal address is a CAN-SPAM / GDPR requirement for real sends —
// it is a placeholder until the CEO provides the real mailing address (escalated on CUB-4).

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

export const config = {
  port: Number(process.env.PORT || 3000),

  // Public base URL used to build confirm / unsubscribe links.
  // Set to the real domain once CUB-2 (hosting/DNS) lands.
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/$/, ''),

  dbPath: process.env.DB_PATH || path.join(root, 'data', 'subscribers.db'),
  outboxDir: process.env.OUTBOX_DIR || path.join(root, 'data', 'outbox'),

  // Mailer transport: 'outbox' writes emails to disk (no ESP needed to prove the loop).
  // CUB-5 will add an 'esp' transport behind this same interface.
  mailTransport: process.env.MAIL_TRANSPORT || 'outbox',

  // Sender identity + compliance footer content.
  sender: {
    name: process.env.SENDER_NAME || 'The Beaches Beat',
    email: process.env.SENDER_EMAIL || 'hello@thebeachesbeat.com',
  },

  // CAN-SPAM requires a valid physical postal address in every commercial email.
  // TODO(CEO): replace with the real registered mailing address before real sends.
  physicalAddress:
    process.env.PHYSICAL_ADDRESS ||
    'The Beaches Beat — [PENDING CEO: physical mailing address required for CAN-SPAM]',

  listName: process.env.LIST_NAME || 'The Beaches Beat weekly',
};
