const content = {
  privacy: {
    eyebrow: 'Privacy',
    title: 'Privacy Notice',
    effective: 'Effective June 22, 2026',
    sections: [
      [
        'Information we process',
        'We process account, identity, vehicle, booking, payment-reference, communications, device, location, and proof-of-delivery data to provide logistics services, prevent fraud, resolve disputes, meet legal obligations, and improve reliability.'
      ],
      [
        'Location and delivery evidence',
        'Location and delivery evidence are limited to active job purposes and authorized participants. Payment providers process payment credentials under their own notices; iTruck stores references and reconciliation records rather than raw card credentials.'
      ],
      [
        'Retention and choices',
        'We retain records only as needed for operations, claims, accounting, security, and applicable law. Users may request access, correction, or deletion where legally available through iTruck support.'
      ],
      [
        'Launch notice',
        'Country-specific retention periods, subprocessors, lawful bases, cross-border transfer terms, and regulator disclosures will be finalized through local legal review before production launch.'
      ]
    ]
  },
  terms: {
    eyebrow: 'Legal',
    title: 'Terms of Service',
    effective: 'Effective June 22, 2026',
    sections: [
      [
        'Using iTruck',
        'iTruck connects shippers, carriers, owners, and drivers and records logistics workflows. Users must provide accurate information, maintain required licenses and insurance, protect account access, and use the platform lawfully.'
      ],
      [
        'Bookings and payments',
        'Quotes, bids, capacity reservations, delivery evidence, payment releases, refunds, and disputes are governed by the confirmed booking and applicable provider rules.'
      ],
      [
        'Prohibited conduct',
        'Users must not falsify location, cargo, identity, vehicle, receiver, or proof-of-delivery information, interfere with platform security, or use iTruck for prohibited cargo or unlawful activity.'
      ],
      [
        'Launch notice',
        'Liability, claims windows, cancellation fees, insurance allocation, governing law, and dispute resolution require qualified local legal review for each launch jurisdiction.'
      ]
    ]
  }
};

export default function LegalPage({ type }) {
  const page = content[type] || content.privacy;
  return (
    <article className="legal-page">
      <header>
        <p className="eyebrow">{page.eyebrow}</p>
        <h2>{page.title}</h2>
        <p>{page.effective}</p>
      </header>
      {page.sections.map(([title, text]) => (
        <section key={title}>
          <h3>{title}</h3>
          <p>{text}</p>
        </section>
      ))}
      <p className="legal-draft-note">
        This product copy is a launch draft and does not replace jurisdiction-specific legal advice.
      </p>
    </article>
  );
}
