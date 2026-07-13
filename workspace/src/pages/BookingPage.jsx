import { useState, useEffect, useMemo, useRef } from 'react';
import { Send, FileText } from 'lucide-react';
import { api } from '../api.js';
import Input from '../components/Input.jsx';
import TextArea from '../components/TextArea.jsx';
import Select from '../components/Select.jsx';
import Panel from '../components/Panel.jsx';
import AsyncState from '../components/AsyncState.jsx';
import { useBookingEstimate, useCreateBooking, useTrucks } from '../queries/commercial.js';
import {
  defaultBooking,
  money,
  documentActionFor,
  saveLocal,
  navigate,
  vehicleTypes,
  documentUploadAccept,
  demoDocuments,
  documentActions
} from '../utils/helpers.js';

export default function BookingPage({ notify, route = '/app/book' }) {
  const [form, setForm] = useState(defaultBooking);
  const [ack, setAck] = useState(false);
  const [quoteDocument, setQuoteDocument] = useState(null);
  const [quoteDocBusy, setQuoteDocBusy] = useState('');
  const quoteUploadInputRef = useRef(null);
  const pendingQuoteUploadRef = useRef(null);

  const requestedTruckKey = useMemo(() => new URLSearchParams(route.split('?')[1] || '').get('truck') || '', [route]);
  const preferenceQuery = useTrucks(
    { verified: true, isAvailable: true, limit: 50 },
    { enabled: Boolean(requestedTruckKey) }
  );
  const requestedTruck = useMemo(() => {
    if (!requestedTruckKey) return null;
    return (preferenceQuery.data || []).find((truck) =>
      [truck.id, truck.plate].some((value) => String(value) === requestedTruckKey)
    );
  }, [preferenceQuery.data, requestedTruckKey]);
  const requestedTruckError = useMemo(() => {
    if (!requestedTruckKey || preferenceQuery.isPending) return '';
    if (preferenceQuery.isError) return preferenceQuery.error?.message || 'Carrier preference could not be loaded.';
    if (!requestedTruck) return 'That carrier is no longer verified and available. Choose another vehicle.';
    return '';
  }, [preferenceQuery.error, preferenceQuery.isError, preferenceQuery.isPending, requestedTruck, requestedTruckKey]);
  const estimatePayload = useMemo(() => ({ ...form, crossBorder: form.border === 'Cross-border' }), [form]);
  const estimateQuery = useBookingEstimate(estimatePayload);
  const estimate = estimateQuery.data;
  const createBooking = useCreateBooking();
  const quoteDocuments = useMemo(
    () => [...new Set([...(estimate?.requiredDocuments || []), ...demoDocuments])],
    [estimate]
  );

  useEffect(() => {
    if (!requestedTruck?.type) return;
    setForm((current) =>
      current.vehicleType === requestedTruck.type ? current : { ...current, vehicleType: requestedTruck.type }
    );
  }, [requestedTruck]);

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleService(service) {
    setForm((current) => {
      const set = new Set(current.optionalServices || []);
      set.has(service) ? set.delete(service) : set.add(service);
      return { ...current, optionalServices: [...set] };
    });
  }

  function bookingDraftPayload() {
    return {
      ...form,
      estimate,
      route: [form.pickup, form.destination].filter(Boolean).join(' to ')
    };
  }

  async function openQuoteDocument(label) {
    const definition = documentActionFor(label);
    setQuoteDocument({
      label: definition.label,
      status:
        definition.mode === 'upload'
          ? 'Choose files to attach to this booking draft.'
          : 'Generating a booking draft document.'
    });

    if (definition.mode === 'upload') {
      pendingQuoteUploadRef.current = definition;
      quoteUploadInputRef.current?.click();
      return;
    }

    setQuoteDocBusy(definition.type);
    try {
      await api.downloadDraftDocument(definition.type, bookingDraftPayload());
      setQuoteDocument({
        label: definition.label,
        status: `${definition.label} draft downloaded from the live document service.`
      });
      notify(`${definition.label} draft downloaded`);
    } catch (err) {
      notify(err.message);
    } finally {
      setQuoteDocBusy('');
    }
  }

  async function uploadQuoteDocumentFiles(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;

    const definition = pendingQuoteUploadRef.current || documentActions[1];
    setQuoteDocBusy(definition.type);
    try {
      const data = await api.uploadCargo(files);
      saveLocal('quote_documents', {
        document: definition.label,
        files: files.map((file) => file.name),
        urls: data.urls || [],
        route: [form.pickup, form.destination].filter(Boolean).join(' to ')
      });
      setQuoteDocument({
        label: definition.label,
        status: `${files.length} file${files.length === 1 ? '' : 's'} uploaded and attached to this booking draft.`
      });
      notify(`${definition.label} uploaded`);
    } catch (err) {
      notify(err.message);
    } finally {
      setQuoteDocBusy('');
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (!ack) {
      notify('Review and acknowledge quote details first');
      return;
    }

    const payload = {
      ...form,
      ...(estimate?.route || {}),
      estimate,
      ...(requestedTruck?.id ? { requestedTruck: requestedTruck.id } : {}),
      quoteAcknowledged: true
    };
    createBooking.reset();
    try {
      await createBooking.mutateAsync(payload);
      notify('Booking request created');
      navigate('/app/shipper');
    } catch (err) {
      if (import.meta.env.NODE_ENV === 'development') {
        console.error('Booking submission failed:', err);
      }
      notify(err.message || 'Booking request was not created. Review the form and try again.');
    }
  }

  return (
    <form className="booking-grid" onSubmit={submit}>
      <input
        ref={quoteUploadInputRef}
        type="file"
        accept={documentUploadAccept}
        multiple
        onChange={uploadQuoteDocumentFiles}
        style={{ display: 'none' }}
      />
      <section className="form-sections">
        {requestedTruck ? (
          <section className="truck-profile-panel" aria-label="Requested carrier preference">
            <div>
              <p className="eyebrow">Carrier preference</p>
              <h2>{requestedTruck.name}</h2>
              <p>
                {requestedTruck.plate} · {requestedTruck.type}. This preference is saved with the request; final
                assignment still requires an eligible carrier award.
              </p>
            </div>
            <button
              className="ghost"
              type="button"
              onClick={() => {
                navigate('/app/book');
              }}
            >
              Clear preference
            </button>
          </section>
        ) : null}
        {requestedTruckKey && preferenceQuery.isPending ? (
          <section className="async-state compact" role="status" aria-live="polite">
            <strong>Checking carrier availability...</strong>
          </section>
        ) : null}
        {requestedTruckError ? (
          <AsyncState
            compact
            title="Carrier preference unavailable"
            detail={requestedTruckError}
            actionLabel={preferenceQuery.isError ? 'Retry availability check' : 'Choose another carrier'}
            onRetry={preferenceQuery.isError ? () => preferenceQuery.refetch() : () => navigate('/app/marketplace')}
          />
        ) : null}
        <Panel title="Route" eyebrow="Step 1">
          <div className="form-grid">
            <Input label="Pickup" value={form.pickup} onChange={(value) => update('pickup', value)} />
            <Input label="Destination" value={form.destination} onChange={(value) => update('destination', value)} />
            <Input
              label="Distance km (road route)"
              type="number"
              value={estimate?.route?.distance || form.distance}
              onChange={(value) => update('distance', Number(value))}
            />
            <Select
              label="Border"
              value={form.border}
              onChange={(value) => update('border', value)}
              options={['Domestic', 'Cross-border']}
            />
            <Select
              label="Pickup window"
              value={form.pickupWindow}
              onChange={(value) => update('pickupWindow', value)}
              options={[
                'Flexible pickup window',
                'Morning pickup',
                'Afternoon pickup',
                'Evening pickup',
                'Appointment required'
              ]}
            />
          </div>
        </Panel>

        <Panel title="Vehicle & Cargo" eyebrow="Step 2">
          <div className="vehicle-picks">
            {vehicleTypes.map((type) => (
              <button
                className={form.vehicleType === type ? 'active' : ''}
                type="button"
                key={type}
                onClick={() => update('vehicleType', type)}
              >
                {type}
              </button>
            ))}
          </div>
          <div className="form-grid">
            <TextArea label="Cargo" value={form.cargo} onChange={(value) => update('cargo', value)} />
            <Input label="Weight" value={form.weight} onChange={(value) => update('weight', value)} />
            <Select
              label="Handling"
              value={form.requirements}
              onChange={(value) => update('requirements', value)}
              options={['Standard', 'Refrigerated', 'Crane', 'Hazardous']}
            />
            <Input
              label="Cargo value USD"
              type="number"
              value={form.cargoValue}
              onChange={(value) => update('cargoValue', Number(value))}
            />
          </div>
          <div className="service-grid">
            {[
              ['loadingCrew', 'Loading crew'],
              ['customsBroker', 'Customs broker'],
              ['temperatureControl', 'Temperature control'],
              ['highValueCover', 'High-value cover'],
              ['returnLoadFlexible', 'Flexible return load']
            ].map(([key, label]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={(form.optionalServices || []).includes(key)}
                  onChange={() => toggleService(key)}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </Panel>

        <Panel title="Receiver & Payment" eyebrow="Step 3">
          <div className="form-grid">
            <Input
              label="Receiver name"
              value={form.receiverName}
              onChange={(value) => update('receiverName', value)}
            />
            <Input
              label="Receiver phone"
              value={form.receiverPhone}
              onChange={(value) => update('receiverPhone', value)}
            />
            <Select
              label="Updates"
              value={form.communicationPreference}
              onChange={(value) => update('communicationPreference', value)}
              options={['WhatsApp + SMS updates', 'SMS only', 'Email updates', 'Phone calls for exceptions only']}
            />
            <Select
              label="Payment"
              value={form.paymentMethod}
              onChange={(value) => update('paymentMethod', value)}
              options={['Wallet', 'M-Pesa', 'MTN MoMo', 'Airtel Money', 'Card escrow', 'Cash on delivery']}
            />
          </div>
        </Panel>
      </section>

      <aside className="quote-panel">
        <Panel title="Quote Review" eyebrow="Live Estimate">
          {estimateQuery.isPending ? (
            <p className="refresh-status" role="status">
              Calculating live quote...
            </p>
          ) : null}
          {estimateQuery.isFetching && !estimateQuery.isPending ? (
            <p className="refresh-status" role="status">
              Updating live quote...
            </p>
          ) : null}
          {estimateQuery.isError ? (
            <AsyncState
              compact
              title={estimate ? 'Quote refresh failed' : 'Live quote unavailable'}
              detail={
                estimate
                  ? 'The last live quote remains visible while you retry.'
                  : estimateQuery.error?.message || 'Pricing could not be calculated.'
              }
              onRetry={() => estimateQuery.refetch()}
            />
          ) : null}
          <div className="estimate-total">
            <span>{estimate?.confidence || 'medium'} confidence</span>
            <strong>{money(estimate?.total, estimate?.currency)}</strong>
            <small>
              {estimate?.recommendedMode?.replace('-', ' ') || 'instant match'} - {estimate?.routeRisk || 'low'} risk
            </small>
          </div>
          <div className="line-items">
            {(estimate?.lineItems || []).map((item) => (
              <div key={item.key}>
                <span>{item.label}</span>
                <strong>{money(item.amount, estimate.currency)}</strong>
              </div>
            ))}
          </div>
          <div className="doc-list compact">
            {quoteDocuments.map((item) => {
              const definition = documentActionFor(item);
              return (
                <button
                  type="button"
                  key={item}
                  disabled={quoteDocBusy === definition.type}
                  onClick={() => openQuoteDocument(item)}
                >
                  {quoteDocBusy === definition.type ? 'Working...' : item}
                </button>
              );
            })}
          </div>
          {quoteDocument ? (
            <div className="verification-card">
              <FileText size={28} />
              <strong>{quoteDocument.label}</strong>
              <span>{quoteDocument.status}</span>
            </div>
          ) : null}
          <label className="ack-row">
            <input type="checkbox" checked={ack} onChange={(event) => setAck(event.target.checked)} />
            <span>I reviewed fees, optional services, and required documents.</span>
          </label>
          {createBooking.isError ? (
            <AsyncState
              compact
              title="Booking request was not created"
              detail={createBooking.error?.message || 'Review the form and try again.'}
            />
          ) : null}
          <button className="primary full icon-label" type="submit" disabled={createBooking.isPending}>
            <Send size={18} />
            <span>{createBooking.isPending ? 'Submitting...' : 'Confirm Booking'}</span>
          </button>
        </Panel>
      </aside>
    </form>
  );
}
