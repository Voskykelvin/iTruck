import { Link } from 'react-router-dom';

const notices = {
  privacy: {
    title: 'Privacy Notice',
    effective: 'June 22, 2026',
    paragraphs: [
      'iTruck processes account, identity, vehicle, booking, payment-reference, communications, device, location, and proof-of-delivery data to provide logistics services, prevent fraud, resolve disputes, meet legal obligations, and improve reliability.',
      'Location and delivery evidence are limited to active job purposes and authorized participants. Payment providers process payment credentials under their own notices; iTruck stores references and reconciliation records rather than raw card credentials.',
      'We retain records only as needed for operations, claims, accounting, security, and applicable law. Access is role-scoped and sensitive activity is audited. Users may request access, correction, or deletion where legally available through the support channel in the application.',
      'This notice requires local legal review, a named data controller and contact, jurisdiction-specific retention periods, subprocessors, lawful bases, and cross-border transfer terms before production launch.'
    ]
  },
  terms: {
    title: 'Terms of Service',
    effective: 'June 22, 2026',
    paragraphs: [
      'iTruck connects shippers, carriers, owners, and drivers and records logistics workflows. Users must provide accurate information, maintain required licenses and insurance, protect account access, and use the platform lawfully.',
      'Quotes, bids, capacity reservations, delivery evidence, payment releases, refunds, and disputes are governed by the confirmed booking and applicable provider rules. Users must not falsify location, cargo, identity, vehicle, receiver, or proof-of-delivery information.',
      'Service availability may be affected by networks, maps, mobile-money, banking, and other third-party providers. Liability, prohibited cargo, claims windows, cancellation fees, insurance allocation, governing law, and dispute resolution must be finalized for each launch jurisdiction before production use.',
      'These draft terms are a product implementation artifact and require qualified local legal review before launch.'
    ]
  }
};

export default function LegalPage({ type }) {
  const notice = notices[type] || notices.terms;
  return (
    <main className="page-container" style={{ maxWidth: 820, paddingTop: 'var(--space-10)' }}>
      <Link to="/" className="text-brand">
        ← Back to iTruck
      </Link>
      <article className="glass-panel stack-lg" style={{ marginTop: 'var(--space-6)', padding: 'var(--space-8)' }}>
        <header>
          <h1 className="page-title">{notice.title}</h1>
          <p className="text-muted">Effective: {notice.effective}</p>
        </header>
        {notice.paragraphs.map((paragraph) => (
          <p key={paragraph} className="text-secondary" style={{ lineHeight: 1.7 }}>
            {paragraph}
          </p>
        ))}
      </article>
    </main>
  );
}
