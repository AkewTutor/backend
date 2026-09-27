import axios from 'axios';
import crypto from 'node:crypto';
import { env } from '../../config/env.js';

export async function initiateCheckout(
  amount: string,
  reference: string,
  callbackUrl: string,
): Promise<{ checkoutUrl: string }> {
  const url = `${env.CHAPA_BASE_URL}/v1/transaction/initialize`;

  const response = await axios.post(
    url,
    {
      amount,
      currency: 'ETB',
      tx_ref: reference,
      callback_url: callbackUrl,
    },
    {
      headers: {
        Authorization: `Bearer ${env.CHAPA_SECRET_KEY}`,
      },
    },
  );

  return { checkoutUrl: response.data.data.checkout_url };
}

export async function verifyWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string,
): Promise<boolean> {
  if (!signatureHeader || typeof signatureHeader !== 'string') {
    return false;
  }
  try {
    const expected = crypto
      .createHmac('sha256', env.CHAPA_WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');
    return expected === signatureHeader;
  } catch (err) {
    return false;
  }
}
