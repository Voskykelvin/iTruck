import { Fragment, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Box, Truck, ShieldCheck, ArrowRight, ArrowLeft } from 'lucide-react';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import { useCreateBooking, useBookingEstimate, useBookingDraft } from '../queries/commercial';
import { defaultBooking, money } from '../utils/helpers';
import { useToast } from '../components/ui/Toast';

export default function BookPage() {
  const navigate = useNavigate();
  const { addToast } = useToast();

  const { data: draftData } = useBookingDraft();
  const createBooking = useCreateBooking();

  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState(defaultBooking);

  useEffect(() => {
    if (draftData && Object.keys(draftData).length > 0) {
      setFormData((prev) => ({ ...prev, ...draftData }));
    }
  }, [draftData]);

  const estimateQuery = useBookingEstimate({
    distance: formData.distance,
    vehicleType: formData.vehicleType,
    border: formData.border,
    weight: formData.weight,
    cargoValue: formData.cargoValue
  });

  const handleNext = () => setStep((s) => Math.min(s + 1, 4));
  const handlePrev = () => setStep((s) => Math.max(s - 1, 1));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (step < 4) {
      handleNext();
      return;
    }

    createBooking.mutate(formData, {
      onSuccess: (data) => {
        addToast({ title: 'Booking Created', message: 'Your shipment request has been posted.', type: 'success' });
        navigate(`/app/shipments/${data.booking?.id || data.booking?._id || ''}`);
      },
      onError: (err) => {
        addToast({ title: 'Booking Failed', message: err.message, type: 'error' });
      }
    });
  };

  const steps = [
    { id: 1, title: 'Route', icon: MapPin },
    { id: 2, title: 'Cargo', icon: Box },
    { id: 3, title: 'Vehicle', icon: Truck },
    { id: 4, title: 'Review', icon: ShieldCheck }
  ];

  const estimate = estimateQuery.data?.estimate || null;

  return (
    <div className="animate-fade-in" style={{ display: 'flex', gap: 'var(--space-6)', alignItems: 'flex-start' }}>
      <div style={{ flex: 1, maxWidth: 800 }}>
        <div className="page-header">
          <div>
            <h1 className="page-title">Book a Truck</h1>
            <p className="text-secondary">Get instant matching and transparent pricing for your logistics.</p>
          </div>
        </div>

        {/* Wizard Progress */}
        <div className="row" style={{ marginBottom: 'var(--space-8)' }}>
          {steps.map((s, idx) => (
            <Fragment key={s.id}>
              <div
                className="row"
                style={{
                  color: step >= s.id ? 'var(--brand)' : 'var(--text-muted)',
                  fontWeight: step >= s.id ? 600 : 400
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: step >= s.id ? 'var(--brand-soft)' : 'var(--surface-2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 'var(--space-2)'
                  }}
                >
                  <s.icon size={16} />
                </div>
                <span className="truncate">{s.title}</span>
              </div>
              {idx < steps.length - 1 && (
                <div style={{ flex: 1, height: 2, background: step > s.id ? 'var(--brand)' : 'var(--surface-2)' }} />
              )}
            </Fragment>
          ))}
        </div>

        <Card>
          <form onSubmit={handleSubmit} className="stack-lg">
            {/* Step 1: Route */}
            {step === 1 && (
              <div className="stack animate-slide-up">
                <h2 style={{ fontSize: 'var(--text-xl)', marginBottom: 'var(--space-2)' }}>Where are we going?</h2>
                <div className="grid-2">
                  <Input
                    label="Pickup Location"
                    placeholder="Enter city or address"
                    required
                    value={formData.pickup}
                    onChange={(e) => setFormData({ ...formData, pickup: e.target.value })}
                  />
                  <Input
                    label="Destination"
                    placeholder="Enter city or address"
                    required
                    value={formData.destination}
                    onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
                  />
                </div>
                <div className="grid-2">
                  <div className="input-group">
                    <label className="input-label">Route Type</label>
                    <select
                      className="input-field"
                      value={formData.border}
                      onChange={(e) => setFormData({ ...formData, border: e.target.value })}
                    >
                      <option value="Domestic">Domestic</option>
                      <option value="Cross-border">Cross-border</option>
                    </select>
                  </div>
                  <Input
                    label="Approx Distance (km)"
                    type="number"
                    value={formData.distance}
                    onChange={(e) => setFormData({ ...formData, distance: e.target.value })}
                  />
                </div>
              </div>
            )}

            {/* Step 2: Cargo */}
            {step === 2 && (
              <div className="stack animate-slide-up">
                <h2 style={{ fontSize: 'var(--text-xl)', marginBottom: 'var(--space-2)' }}>What are we shipping?</h2>
                <Input
                  label="Cargo Description"
                  placeholder="e.g., 500 bags of maize"
                  required
                  value={formData.cargo}
                  onChange={(e) => setFormData({ ...formData, cargo: e.target.value })}
                />
                <div className="grid-2">
                  <Input
                    label="Total Weight (Tonnes)"
                    type="number"
                    required
                    value={formData.weight}
                    onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                  />
                  <Input
                    label="Declared Value (KES)"
                    type="number"
                    placeholder="For insurance purposes"
                    value={formData.cargoValue}
                    onChange={(e) => setFormData({ ...formData, cargoValue: e.target.value })}
                  />
                </div>
                <div className="grid-2">
                  <Input
                    label="Receiver Name"
                    required
                    value={formData.receiverName}
                    onChange={(e) => setFormData({ ...formData, receiverName: e.target.value })}
                  />
                  <Input
                    label="Receiver Phone"
                    required
                    value={formData.receiverPhone}
                    onChange={(e) => setFormData({ ...formData, receiverPhone: e.target.value })}
                  />
                </div>
              </div>
            )}

            {/* Step 3: Vehicle */}
            {step === 3 && (
              <div className="stack animate-slide-up">
                <h2 style={{ fontSize: 'var(--text-xl)', marginBottom: 'var(--space-2)' }}>Vehicle requirements</h2>

                <div className="grid-3">
                  {['Lorry', 'Trailer', 'Refrigerated'].map((type) => (
                    <div
                      key={type}
                      className="glass-panel"
                      style={{
                        padding: 'var(--space-4)',
                        cursor: 'pointer',
                        borderColor: formData.vehicleType === type ? 'var(--brand)' : 'var(--border)',
                        background: formData.vehicleType === type ? 'var(--brand-soft)' : 'var(--surface)',
                        textAlign: 'center'
                      }}
                      onClick={() => setFormData({ ...formData, vehicleType: type })}
                    >
                      <Truck
                        size={32}
                        color={formData.vehicleType === type ? 'var(--brand)' : 'var(--text-muted)'}
                        style={{ margin: '0 auto var(--space-2)' }}
                      />
                      <div style={{ fontWeight: 600 }}>{type}</div>
                    </div>
                  ))}
                </div>

                <div className="input-group" style={{ marginTop: 'var(--space-4)' }}>
                  <label className="input-label">Special Handling</label>
                  <select
                    className="input-field"
                    value={formData.requirements}
                    onChange={(e) => setFormData({ ...formData, requirements: e.target.value })}
                  >
                    <option value="Standard">Standard Cargo</option>
                    <option value="Fragile">Fragile Handling</option>
                    <option value="Hazmat">Hazardous Materials</option>
                    <option value="Cold Chain">Temperature Controlled</option>
                  </select>
                </div>
              </div>
            )}

            {/* Step 4: Review */}
            {step === 4 && (
              <div className="stack animate-slide-up">
                <h2 style={{ fontSize: 'var(--text-xl)', marginBottom: 'var(--space-2)' }}>Review & Confirm</h2>

                <div className="grid-2">
                  <div className="stack-sm">
                    <div className="eyebrow">Route</div>
                    <div style={{ fontWeight: 600, color: 'var(--ink)' }}>
                      {formData.pickup || '—'} → {formData.destination || '—'}
                    </div>
                    <div className="text-secondary" style={{ fontSize: 'var(--text-sm)' }}>
                      {formData.border} • {formData.distance} km
                    </div>
                  </div>

                  <div className="stack-sm">
                    <div className="eyebrow">Cargo & Vehicle</div>
                    <div style={{ fontWeight: 600, color: 'var(--ink)' }}>
                      {formData.cargo || '—'} ({formData.weight}t)
                    </div>
                    <div className="text-secondary" style={{ fontSize: 'var(--text-sm)' }}>
                      {formData.vehicleType} • {formData.requirements}
                    </div>
                  </div>
                </div>

                <div className="divider" />

                <div className="row" style={{ gap: 'var(--space-2)', color: 'var(--brand-mid)' }}>
                  <ShieldCheck size={20} />
                  <span style={{ fontWeight: 600 }}>iTruck Protection</span>
                </div>
                <p className="text-secondary" style={{ fontSize: 'var(--text-sm)' }}>
                  Your payment will be held securely in escrow until you confirm delivery using the cryptographic
                  receiver OTP.
                </p>
              </div>
            )}

            <div
              className="row-between"
              style={{
                marginTop: 'var(--space-6)',
                paddingTop: 'var(--space-4)',
                borderTop: '1px solid var(--border)'
              }}
            >
              <Button
                type="button"
                variant="ghost"
                onClick={handlePrev}
                disabled={step === 1 || createBooking.isPending}
                icon={ArrowLeft}
              >
                Back
              </Button>

              <Button
                type="submit"
                variant="primary"
                loading={createBooking.isPending}
                style={{ flexDirection: 'row-reverse' }}
              >
                {step === 4 ? 'Confirm & Book' : 'Continue'}
                {step < 4 && <ArrowRight size={16} style={{ marginLeft: 'var(--space-2)' }} />}
              </Button>
            </div>
          </form>
        </Card>
      </div>

      {/* Side Panel: Estimate */}
      <div style={{ width: 340, display: 'none' }} className="desktop-only">
        <style>{`@media(min-width: 1024px) { .desktop-only { display: block !important; } }`}</style>
        <div style={{ position: 'sticky', top: 100 }}>
          <Card className="stack">
            <h3 style={{ fontSize: 'var(--text-lg)', margin: 0 }}>Estimate</h3>

            {estimateQuery.isLoading ? (
              <div className="stack-sm">
                <div className="skeleton skeleton-text" />
                <div className="skeleton skeleton-text" style={{ height: 40 }} />
              </div>
            ) : estimate ? (
              <div className="stack-sm">
                <div style={{ fontSize: 'var(--text-3xl)', fontWeight: 700, color: 'var(--ink)' }}>
                  {money(estimate.total, estimate.currency)}
                </div>

                <div className="divider" />

                <div className="stack-sm">
                  {estimate.lineItems?.map((item, i) => (
                    <div key={i} className="row-between" style={{ fontSize: 'var(--text-sm)' }}>
                      <span className="text-secondary">{item.label}</span>
                      <span style={{ fontWeight: 600 }}>{money(item.amount, estimate.currency)}</span>
                    </div>
                  ))}
                </div>

                <div className="divider" />

                <div className="row-between" style={{ fontSize: 'var(--text-sm)' }}>
                  <span className="text-secondary">Route Risk</span>
                  <Badge variant={estimate.routeRisk === 'low' ? 'success' : 'warning'}>{estimate.routeRisk}</Badge>
                </div>
              </div>
            ) : (
              <div
                className="text-muted"
                style={{ fontSize: 'var(--text-sm)', textAlign: 'center', padding: 'var(--space-4) 0' }}
              >
                Fill out the route details to see a live estimate.
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
