const {
  QueuedEmailProvider,
  ResendEmailProvider,
  SendGridEmailProvider,
  SmtpEmailProvider
} = require('../services/email');

function response(status, body = '') {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body
  };
}

test('queued email provider does not expose recipient addresses in its result contract', async () => {
  const provider = new QueuedEmailProvider();
  const result = await provider.send({ to: 'shipper@example.com', subject: 'Queued' });

  expect(result.provider).toBe('queue');
});

test('Resend provider sends the documented API payload', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(response(200, JSON.stringify({ id: 'email-1' })));
  const provider = new ResendEmailProvider({
    apiKey: 'resend-key',
    from: 'iTruck <no-reply@itruck.example>',
    fetchImpl
  });

  const result = await provider.send({
    to: 'shipper@example.com',
    subject: 'Shipment update',
    text: 'Your shipment moved.'
  });

  expect(result).toEqual({ provider: 'resend', id: 'email-1' });
  expect(fetchImpl).toHaveBeenCalledWith(
    'https://api.resend.com/emails',
    expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer resend-key' })
    })
  );
  expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual(
    expect.objectContaining({
      from: 'iTruck <no-reply@itruck.example>',
      to: ['shipper@example.com'],
      subject: 'Shipment update'
    })
  );
});

test('SendGrid provider accepts a successful empty 202 response', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(response(202));
  const provider = new SendGridEmailProvider({
    apiKey: 'sendgrid-key',
    from: 'iTruck <no-reply@itruck.example>',
    fetchImpl
  });

  const result = await provider.send({
    to: ['owner@example.com'],
    subject: 'Bid accepted',
    html: '<p>Your bid was accepted.</p>'
  });

  expect(result).toEqual({ provider: 'sendgrid', status: 202 });
  expect(fetchImpl).toHaveBeenCalledWith(
    'https://api.sendgrid.com/v3/mail/send',
    expect.objectContaining({ method: 'POST' })
  );
});

test('SMTP provider reuses its transporter and applies the configured sender', async () => {
  const transporter = { sendMail: jest.fn().mockResolvedValue({ messageId: 'smtp-1' }) };
  const provider = new SmtpEmailProvider({
    from: 'iTruck <no-reply@itruck.example>',
    transporter
  });

  const result = await provider.send({
    to: 'client@example.com',
    subject: 'Password reset',
    text: 'Reset link'
  });

  expect(result).toEqual({ provider: 'smtp', messageId: 'smtp-1' });
  expect(transporter.sendMail).toHaveBeenCalledWith(
    expect.objectContaining({
      from: 'iTruck <no-reply@itruck.example>',
      to: ['client@example.com']
    })
  );
});
