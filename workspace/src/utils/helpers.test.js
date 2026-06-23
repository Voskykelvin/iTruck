import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as helpers from './helpers.js';

describe('helpers.js unit tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('documentActionFor and liveDocumentActionFor', () => {
    expect(helpers.documentActionFor('Waybill').type).toBe('waybill');
    expect(helpers.documentActionFor('Unknown Action').type).toBe('unknown-action');
    expect(helpers.liveDocumentActionFor('Waybill').mode).toBe('download');
    expect(helpers.liveDocumentActionFor('Cargo photos').mode).toBe('upload');
  });

  it('handoverDocumentActionsFor', () => {
    const shipment = {
      documents: ['Waybill']
    };
    const actions = helpers.handoverDocumentActionsFor(shipment);
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.find((a) => a.type === 'waybill')).toBeDefined();
  });

  it('routeFromLocation', () => {
    delete window.location;
    window.location = { pathname: '/app/book', search: '?q=1' };
    expect(helpers.routeFromLocation()).toBe('/app/book?q=1');

    window.location = { pathname: '/app', search: '' };
    expect(helpers.routeFromLocation()).toBe('/app/shipper');
  });

  it('navForUser', () => {
    expect(helpers.navForUser({ role: 'admin' }).length).toBeGreaterThan(0);
    expect(helpers.navForUser({ role: 'unknown' }).length).toBeGreaterThan(0);
  });

  it('navigate', () => {
    const pushSpy = vi.spyOn(window.history, 'pushState');
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    helpers.navigate('/test-path');
    expect(pushSpy).toHaveBeenCalledWith({}, '', '/test-path');
    expect(dispatchSpy).toHaveBeenCalled();
  });

  it('copyToClipboard', async () => {
    const writeTextSpy = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextSpy
      }
    });
    await helpers.copyToClipboard('test-value');
    expect(writeTextSpy).toHaveBeenCalledWith('test-value');

    // Test fallback text area copy
    navigator.clipboard.writeText = null;
    document.execCommand = vi.fn().mockImplementation(() => true);
    const documentSpy = vi.spyOn(document, 'createElement');
    const execSpy = vi.spyOn(document, 'execCommand');
    await helpers.copyToClipboard('test-value-fallback');
    expect(documentSpy).toHaveBeenCalledWith('textarea');
    expect(execSpy).toHaveBeenCalledWith('copy');
  });

  it('activateOnEnter', () => {
    const actionSpy = vi.fn();
    const event1 = { key: 'Enter', preventDefault: vi.fn() };
    helpers.activateOnEnter(event1, actionSpy);
    expect(actionSpy).toHaveBeenCalled();
    expect(event1.preventDefault).toHaveBeenCalled();

    const event2 = { key: 'Escape', preventDefault: vi.fn() };
    helpers.activateOnEnter(event2, actionSpy);
    expect(actionSpy).toHaveBeenCalledTimes(1); // not called again
  });

  it('money', () => {
    expect(helpers.money(1500)).toBe('USD 1,500');
    expect(helpers.money(0, 'KES')).toBe('KES 0');
  });

  it('saveLocal and readLocal', () => {
    const record = helpers.saveLocal('test', { key: 'val' });
    expect(record.key).toBe('val');
    expect(record.mode).toBe('local');
    const read = helpers.readLocal('test');
    expect(read.length).toBe(1);
    expect(read[0].key).toBe('val');
  });

  it('slugDocumentType and normalizers', () => {
    expect(helpers.slugDocumentType('Owner KYC')).toBe('owner-kyc');
    expect(helpers.normalizeProfileDocumentType('kyc', 'owner')).toBe('owner-kyc');
    expect(helpers.normalizeProfileDocumentType('kyc', 'client')).toBe('shipper-kyc');
    expect(helpers.normalizeTruckDocumentType('license')).toBe('road-license');
    expect(helpers.normalizeBookingDocumentType('cargo-photo')).toBe('cargo-photos');
  });

  it('documentTargetIdentity and normalization', () => {
    expect(helpers.recordIdentity({ _id: '123' })).toBe('123');
    expect(helpers.documentTargetIdentity({ target: { id: 'abc' } })).toBe('abc');
    expect(helpers.documentTargetIdentity({ targetId: 'xyz' })).toBe('xyz');

    expect(helpers.normalizeIndexedDocumentType('user', 'kyc', { role: 'owner' })).toBe('owner-kyc');
    expect(helpers.normalizeIndexedDocumentType('truck', 'license')).toBe('road-license');
    expect(helpers.normalizeIndexedDocumentType('booking', 'cargo-photo')).toBe('cargo-photos');
  });

  it('mergeDocumentLists and bookingDocumentsFrom', () => {
    const base = [{ type: 'waybill', url: 'url1' }];
    const indexed = [{ type: 'cargo-photo', urls: ['url2'] }];
    const merged = helpers.mergeDocumentLists(base, indexed, 'booking');
    expect(merged.length).toBe(2);
    expect(merged.find((d) => d.type === 'cargo-photos').url).toBe('url2');
  });

  it('bookingDocumentFor, documentIsAvailable and shipmentDocumentStatus', () => {
    const shipment = {
      bookingDocuments: [{ type: 'waybill', url: 'url1', status: 'approved' }]
    };
    expect(helpers.bookingDocumentFor(shipment, 'waybill')).toBeDefined();
    expect(helpers.documentHasFile({ url: 'test' })).toBe(true);
    expect(helpers.documentIsAvailable({ generatedAt: 'time' })).toBe(true);
    expect(helpers.shipmentDocumentStatus(shipment, 'waybill')).toBe('approved');
    expect(helpers.shipmentDocumentStatus(shipment, 'invoice')).toBe('missing');
  });

  it('deliveryProofDocument and hasReceiverGradeProof', () => {
    const shipment = {
      bookingDocuments: [{ type: 'pod', url: 'url', status: 'approved' }],
      deliveryProof: {
        proof: true,
        recordHash: 'a'.repeat(64),
        verificationMethod: 'sms_otp',
        verifiedAt: 'now',
        photoCount: 2
      }
    };
    expect(helpers.deliveryProofDocument(shipment)).toBeDefined();
    expect(helpers.hasReceiverGradeProof(shipment)).toBe(true);
  });

  it('upsertGeneratedBookingDocument', () => {
    const shipment = {
      bookingDocuments: [{ type: 'waybill', status: 'pending' }]
    };
    const next = helpers.upsertGeneratedBookingDocument(shipment, 'waybill');
    expect(next.bookingDocuments[0].status).toBe('approved');
  });

  it('hasDestinationCoordinates', () => {
    expect(helpers.hasDestinationCoordinates({ destinationCoordinates: { lat: 1, lng: 2 } })).toBe(true);
    expect(helpers.hasDestinationCoordinates({})).toBe(false);
  });

  it('mergeDocumentIndex', () => {
    const records = [{ id: 'rec-1', documents: [] }];
    const indexed = [{ targetId: 'rec-1', targetType: 'booking', type: 'waybill', url: 'test-url' }];
    const merged = helpers.mergeDocumentIndex(records, indexed, 'booking');
    expect(merged[0].documents.length).toBe(1);
  });

  it('profileDocumentsReady', () => {
    const user = {
      documents: [
        { type: 'shipper-kyc', status: 'approved' },
        { type: 'business-registration', status: 'approved' },
        { type: 'tax-certificate', status: 'approved' }
      ]
    };
    expect(helpers.profileDocumentsReady(user, 'client')).toBe(true);
  });

  it('chat helpers', () => {
    expect(helpers.chatKey('123')).toBe('itruck_chat_123');
    expect(helpers.formatMessageTime('2026-06-23T10:00:00.000Z')).toBeDefined();

    const messages = [{ text: 'hello' }];
    helpers.persistLocalChat('123', messages);
    const read = helpers.readLocalChat({ id: '123' });
    expect(read[0].text).toBe('hello');
  });

  it('userIdFor and userDisplayName', () => {
    expect(helpers.userIdFor('123')).toBe('123');
    expect(helpers.userIdFor({ _id: '123' })).toBe('123');
    expect(helpers.userDisplayName({ firstName: 'A', lastName: 'B' })).toBe('A B');
  });

  it('mongoObjectId', () => {
    expect(helpers.mongoObjectId('60b8d2f5f1d8f82cb412bb45')).toBe(true);
    expect(helpers.mongoObjectId('invalid')).toBe(false);
  });

  it('bidDraftForLoad and bidPayloadForDraft', () => {
    const load = { price: 1000, window: '2 days' };
    const fleet = [{ id: '123', verified: true, plate: 'P1', name: 'N1' }];
    const draft = helpers.bidDraftForLoad(load, fleet);
    expect(draft.amount).toBe(1000);
    expect(draft.truck).toBe('123');

    const payload = helpers.bidPayloadForDraft(draft, fleet);
    expect(payload.amount).toBe(1000);
    expect(payload.message).toContain('Vehicle: P1 N1');
  });

  it('normalizeWorkflowMessage', () => {
    const item = {
      _id: 'm1',
      payload: { text: 'hi', sender: 'me' }
    };
    const norm = helpers.normalizeWorkflowMessage(item, { _id: '123' });
    expect(norm.id).toBe('m1');
    expect(norm.text).toBe('hi');
  });

  it('normalizeTruck and ratingSummary', () => {
    const truck = {
      _id: 't1',
      isVerified: true,
      ratingAverage: 4.5,
      ratingCount: 10
    };
    const norm = helpers.normalizeTruck(truck);
    expect(norm.id).toBe('t1');
    expect(norm.verified).toBe(true);
    expect(helpers.ratingSummary(norm)).toContain('4.5');
  });

  it('normalizeBid, bookingRef and bookingRoute', () => {
    const bid = { amount: 500, status: 'pending' };
    const norm = helpers.normalizeBid(bid);
    expect(norm.amount).toBe(500);

    const booking = { id: 'b1', route: 'R1' };
    expect(helpers.bookingRef(booking)).toBe('b1');
    expect(helpers.bookingRoute(booking)).toBe('R1');
  });

  it('paymentTone and isDebitTransaction', () => {
    expect(helpers.paymentTone('escrowed')).toBe('success');
    expect(helpers.paymentTone('failed')).toBe('danger');
    expect(helpers.paymentTone('pending')).toBe('warn');
    expect(helpers.paymentTone('unknown')).toBe('default');

    expect(helpers.isDebitTransaction({ type: 'debit' })).toBe(true);
  });

  it('notification helpers', () => {
    expect(helpers.notificationId('note')).toContain('note-');
    expect(helpers.notificationLinkForType('bid')).toBe('/app/bids');

    const record = { title: 'T1', type: 'bid' };
    const norm = helpers.normalizeNotificationRecord(record);
    expect(norm.title).toBe('T1');
  });

  it('normalizeBookingShipment', () => {
    const booking = {
      id: 'b1',
      status: 'delivered',
      tracking: [{ lat: 1, lng: 2, speed: 50, city: 'Nairobi' }]
    };
    const norm = helpers.normalizeBookingShipment(booking);
    expect(norm.status).toBe('Delivered');
    expect(norm.position).toBe('Nairobi');
  });

  it('latestTrackingPoint and formatCoordinatePair', () => {
    const shipment = {
      tracking: [
        { lat: 1, lng: 2 },
        { lat: 3, lng: 4 }
      ]
    };
    expect(helpers.latestTrackingPoint(shipment).lat).toBe(3);
    expect(helpers.formatCoordinatePair({ lat: 1, lng: 2 })).toBe('1.00000, 2.00000');
    expect(helpers.formatCoordinatePair(null)).toBe('Awaiting GPS update');
    expect(helpers.formatTrackingTime({ timestamp: '2026-06-23T10:00:00Z' })).toBeDefined();
  });

  it('normalizeOpenLoad, normalizeOwnerBidRecord and ownerBidRecordsFromShipments', () => {
    const booking = { id: 'b1', budget: 1200 };
    const load = helpers.normalizeOpenLoad(booking);
    expect(load.price).toBe(1200);

    const bidRecord = helpers.normalizeOwnerBidRecord({ amount: 1500 });
    expect(bidRecord.amount).toBe(1500);

    const shipments = [{ id: 'b1', route: 'R1', bids: [{ id: 'bid-1', ownerId: 'owner-1', amount: 1000 }] }];
    const records = helpers.ownerBidRecordsFromShipments(shipments, { _id: 'owner-1' });
    expect(records.length).toBe(1);
    expect(records[0].amount).toBe(1000);
  });

  it('fallbackEstimate', () => {
    const payload = { distance: 500, border: 'Cross-border', vehicleType: 'Lorry' };
    const est = helpers.fallbackEstimate(payload);
    expect(est.total).toBeGreaterThan(0);
    expect(est.routeRisk).toBe('medium');
  });

  it('pageTitle', () => {
    expect(helpers.pageTitle('/app/privacy')).toBe('Privacy Notice');
    expect(helpers.pageTitle('/app/unknown')).toBe('Shipper Dashboard');
  });

  it('documentStatusMeta', () => {
    expect(helpers.documentStatusMeta('approved')).toEqual({ tone: 'success', text: 'Verified' });
    expect(helpers.documentStatusMeta('pending')).toEqual({ tone: 'warn', text: 'Under Review' });
    expect(helpers.documentStatusMeta('rejected')).toEqual({ tone: 'danger', text: 'Rejected - Re-upload' });
    expect(helpers.documentStatusMeta('expired')).toEqual({ tone: 'danger', text: 'Expired - Re-upload' });
    expect(helpers.documentStatusMeta('missing')).toEqual({ tone: 'default', text: 'Upload' });
  });
});
