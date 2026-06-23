import React, { useState, useEffect } from 'react';
import { Send } from 'lucide-react';
import { api } from '../api.js';
import { demoShipments } from '../data.js';
import Panel from '../components/Panel.jsx';
import ChatBubble from '../components/ChatBubble.jsx';
import EmptyState from '../components/EmptyState.jsx';
import {
  normalizeBookingShipment,
  userIdFor,
  readLocalChat,
  normalizeWorkflowMessage,
  persistLocalChat,
  userDisplayName,
  roleForUser
} from '../utils/helpers.js';

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';
const workspaceShipments = DEMO_MODE ? demoShipments : [];

export default function MessagesPage({ notify, user }) {
  const [shipments, setShipments] = useState([]);
  const [selected, setSelected] = useState(0);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    api
      .listBookings()
      .then((data) => Array.isArray(data.bookings) && setShipments(data.bookings.map(normalizeBookingShipment)))
      .catch(() => setShipments(workspaceShipments));
  }, []);

  const shipment = shipments[selected] || shipments[0];
  const messageKey = shipment?.bookingId || shipment?.id || '';
  const currentUserId = userIdFor(user);

  useEffect(() => {
    if (!shipment) return;
    setMessages(readLocalChat(shipment));
    api
      .listMessages(messageKey)
      .then((data) => {
        const items = Array.isArray(data.items) ? data.items : [];
        if (items.length) setMessages(items.map((item) => normalizeWorkflowMessage(item, user)));
      })
      .catch(() => {});
  }, [messageKey, shipment, currentUserId, user]);

  async function sendMessage(event) {
    event.preventDefault();
    if (!shipment || !draft.trim()) return;

    const text = draft.trim();
    setDraft('');
    const next = [
      ...messages,
      { id: `message-${Date.now()}`, author: 'me', name: 'You', text, createdAt: new Date().toISOString() }
    ];
    setMessages(next);
    persistLocalChat(shipment.id, next);

    try {
      await api.sendMessage({
        booking: shipment.bookingId,
        bookingId: shipment.bookingId,
        shipmentId: shipment.id,
        route: shipment.route,
        text,
        senderId: userIdFor(user),
        senderName: userDisplayName(user),
        senderRole: roleForUser(user),
        sender: 'me',
        status: 'sent'
      });
    } catch (err) {
      notify(err.message);
    }
  }

  return (
    <section className="tracking-layout">
      <Panel title="Threads" eyebrow="Shipments">
        <div className="tracking-list">
          {shipments.map((item, index) => (
            <button
              className={index === selected ? 'active' : ''}
              type="button"
              key={item.id}
              onClick={() => setSelected(index)}
            >
              <strong>{item.id}</strong>
              <span>{item.route}</span>
              <small>{item.status}</small>
            </button>
          ))}
          {!shipments.length ? (
            <EmptyState title="No messages" detail="Messages attach to synced shipment records." />
          ) : null}
        </div>
      </Panel>
      <Panel title={shipment?.route || 'Messages'} eyebrow="In-house Text">
        <div className="chat-thread">
          {messages.map((message) => (
            <ChatBubble message={message} key={message.id} />
          ))}
        </div>
        <form className="chat-compose" onSubmit={sendMessage}>
          <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Type a message..." />
          <button className="primary" type="submit" aria-label="Send message">
            <Send size={18} />
          </button>
        </form>
      </Panel>
    </section>
  );
}
