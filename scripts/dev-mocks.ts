import express from 'express';

const sms: any[] = [];
const emails: any[] = [];

const smsApp = express().use(express.json());
smsApp.post('/sms/send', (req, res) => {
  const { to, template, message } = req.body ?? {};
  sms.push({ to, template, message, at: new Date() });
  res.status(200).json({ id: `mock-sms-${sms.length}` });
});
smsApp.get('/__test__/messages', (_q, res) => res.json([...sms].reverse()));

const mailApp = express().use(express.json());
mailApp.post('/smtp/email', (req, res) => {
  const { to, subject, htmlContent } = req.body ?? {};
  emails.push({ to: to?.[0]?.email, subject, htmlContent, at: new Date() });
  res.status(201).json({ messageId: `mock-email-${emails.length}` });
});
mailApp.get('/__test__/emails', (_q, res) => res.json([...emails].reverse()));

const chapaApp = express().use(express.json());
chapaApp.post('/v1/transaction/initialize', (req, res) => {
  res.json({
    status: 'success',
    data: { checkout_url: `http://localhost:4001/pay/${req.body?.tx_ref}` },
  });
});

smsApp.listen(4002, () => console.log('SMS   -> http://localhost:4002/__test__/messages'));
mailApp.listen(4003, () => console.log('Email -> http://localhost:4003/__test__/emails'));
chapaApp.listen(4001, () => console.log('Chapa -> http://localhost:4001'));
