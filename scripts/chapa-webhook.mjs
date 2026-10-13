import 'dotenv/config';
import crypto from 'node:crypto';
const [paymentId, event = 'charge.success'] = process.argv.slice(2);
if (!paymentId) throw new Error('usage: node scripts/chapa-webhook.mjs
<paymentId> [charge.success|charge.failed]');
const body = JSON.stringify({ event, tx_ref: paymentId });
const sig = crypto.createHmac('sha256',
process.env.CHAPA_WEBHOOK_SECRET).update(body).digest('hex');
const res = await
fetch('http://localhost:3000/api/v1/payments/webhook/chapa', {
method: 'POST',
headers: { 'content-type': 'application/json', 'chapa-signature': sig },
body,
});
console.log(res.status, await res.text());
