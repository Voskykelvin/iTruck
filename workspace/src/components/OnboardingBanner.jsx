import React, { useState } from 'react';
import { profileDocumentsReady, navigate } from '../utils/helpers.js';

export const ONBOARDING_STEPS_OWNER = [
  { key: 'profile', label: 'Complete profile' },
  { key: 'docs', label: 'Upload docs' },
  { key: 'vehicle', label: 'Add vehicle' },
  { key: 'live', label: 'Go live' }
];

export const ONBOARDING_STEPS_CLIENT = [
  { key: 'profile', label: 'Complete profile' },
  { key: 'docs', label: 'Upload docs' },
  { key: 'booking', label: 'First booking' },
  { key: 'live', label: 'Live tracking' }
];

export function computeOnboardingProgress(user, role, fleet = [], shipments = []) {
  const steps = role === 'owner' ? ONBOARDING_STEPS_OWNER : ONBOARDING_STEPS_CLIENT;
  const hasProfile = Boolean(user?.firstName && user?.email);
  const hasDocs = profileDocumentsReady(user, role);
  const hasVehicle = fleet.length > 0;
  const hasBooking = shipments.length > 0;

  const completed = {
    profile: hasProfile,
    docs: hasDocs,
    vehicle: hasVehicle,
    booking: hasBooking,
    live: role === 'owner' ? hasVehicle && hasDocs : hasBooking && hasDocs
  };

  const doneCount = steps.filter((s) => completed[s.key]).length;
  return { steps, completed, doneCount, total: steps.length, pct: Math.round((doneCount / steps.length) * 100) };
}

export default function OnboardingBanner({ user, role, fleet = [], shipments = [] }) {
  const { steps, completed, doneCount, total, pct } = computeOnboardingProgress(user, role, fleet, shipments);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem('itruck_onboarding_dismissed') === '1');

  if (pct === 100 || dismissed) return null;

  const nextStep = steps.find((s) => !completed[s.key]);

  return (
    <div className="onboarding-banner">
      <div className="onboarding-banner-head">
        <strong>Complete your profile - {pct}% done</strong>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span>
            {doneCount}/{total} steps
          </span>
          <button
            className="dismiss-button"
            type="button"
            onClick={() => {
              setDismissed(true);
              localStorage.setItem('itruck_onboarding_dismissed', '1');
            }}
            aria-label="Dismiss"
          >
            x
          </button>
        </div>
      </div>
      <div className="onboarding-steps">
        {steps.map((step) => (
          <span
            key={step.key}
            className={`onboarding-step ${completed[step.key] ? 'done' : step.key === nextStep?.key ? 'active' : ''}`}
          >
            <span className="onboarding-step-dot" />
            {step.label}
          </span>
        ))}
      </div>
      <div className="onboarding-progress-bar">
        <div className="onboarding-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      {nextStep && (
        <button
          className="ghost"
          type="button"
          style={{ justifySelf: 'start', minHeight: 36, padding: '0 12px', fontSize: 13 }}
          onClick={() => navigate(role === 'owner' ? '/app/onboarding' : '/app/profile')}
        >
          Next: {nextStep.label} →
        </button>
      )}
    </div>
  );
}
