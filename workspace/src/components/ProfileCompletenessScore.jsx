import React from 'react';
import {
  profileDocumentsForRole,
  missingRequiredProfileDocuments,
  navigate
} from '../utils/helpers.js';

export default function ProfileCompletenessScore({ user, role }) {
  const requiredDocuments = profileDocumentsForRole(role);
  const missingDocuments = missingRequiredProfileDocuments(user, role);
  const fields = [
    user?.firstName,
    user?.lastName,
    user?.email,
    user?.phone,
    user?.country,
    requiredDocuments.length ? missingDocuments.length === 0 : true
  ];
  const done = fields.filter(Boolean).length;
  const pct = Math.round((done / fields.length) * 100);
  const r = 20;
  const circ = 2 * Math.PI * r;
  const dash = circ * (pct / 100);

  if (pct === 100) return null;

  const missing = [];
  if (!user?.firstName) missing.push('first name');
  if (!user?.lastName) missing.push('last name');
  if (!user?.phone) missing.push('phone number');
  if (!user?.country) missing.push('country');
  if (missingDocuments.length) missing.push(`${missingDocuments.length} verification document`);

  const needsDocuments = missingDocuments.length > 0;
  const nextPath = needsDocuments ? '/app/documents' : '/app/profile?complete=details';

  return (
    <div className="profile-score-wrap">
      <div className="profile-score-ring">
        <svg width="48" height="48" viewBox="0 0 48 48">
          <circle className="track" cx="24" cy="24" r={r} />
          <circle className="fill" cx="24" cy="24" r={r} strokeDasharray={`${dash} ${circ}`} strokeDashoffset="0" />
        </svg>
        <span className="profile-score-pct">{pct}%</span>
      </div>
      <div className="profile-score-info">
        <strong>{needsDocuments ? 'Verification documents needed' : 'Account details needed'}</strong>
        <span>
          {needsDocuments
            ? `Open Documents to finish ${missingDocuments.length} item(s)`
            : `Add ${missing.slice(0, 2).join(', ')}`}
        </span>
      </div>
      <button
        className="ghost"
        type="button"
        style={{ marginLeft: 'auto', minHeight: 34, padding: '0 12px', fontSize: 13 }}
        onClick={() => navigate(nextPath)}
      >
        {needsDocuments ? 'Open Documents' : 'Complete'}
      </button>
    </div>
  );
}
