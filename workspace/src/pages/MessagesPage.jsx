import { useEffect, useMemo, useState } from 'react';
import { Send } from 'lucide-react';
import io from 'socket.io-client';
import Panel from '../components/Panel.jsx';
import ChatBubble from '../components/ChatBubble.jsx';
import EmptyState from '../components/EmptyState.jsx';
import AsyncState from '../components/AsyncState.jsx';
import { useBookings } from '../queries/commercial.js';
import { useConversationCache, useMessages, useSendMessage } from '../queries/conversations.js';
import { roleForUser, userDisplayName, userIdFor } from '../utils/helpers.js';

export default function MessagesPage({ notify, user }) {
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState('');
  const bookingsQuery = useBookings();
  const shipments = useMemo(() => bookingsQuery.data || [], [bookingsQuery.data]);
  const shipment =
    shipments.find((item) => String(item.bookingId || item.id) === String(selectedId)) || shipments[0] || null;
  const messageKey = shipment?.bookingId || shipment?.id || '';
  const messagesQuery = useMessages(messageKey, user);
  const sendMessageMutation = useSendMessage(user);
  const receiveMessage = useConversationCache(user);
  const messages = messagesQuery.data || [];

  useEffect(() => {
    if (!shipment) {
      setSelectedId('');
      return;
    }
    setSelectedId((current) =>
      shipments.some((item) => String(item.bookingId || item.id) === String(current))
        ? current
        : String(shipment.bookingId || shipment.id)
    );
  }, [shipment, shipments]);

  useEffect(() => {
    if (!messageKey) return undefined;
    const socket = io(window.location.origin, {
      withCredentials: true,
      transports: ['websocket', 'polling']
    });
    socket.emit('join-booking', messageKey);
    socket.on('message:new', (item) => receiveMessage(messageKey, item));
    return () => socket.disconnect();
  }, [messageKey, receiveMessage]);

  async function sendMessage(event) {
    event.preventDefault();
    const text = draft.trim();
    if (!shipment || !text) return;

    try {
      await sendMessageMutation.mutateAsync({
        booking: shipment.bookingId,
        bookingId: shipment.bookingId,
        shipmentId: shipment.id,
        route: shipment.route,
        text,
        senderId: userIdFor(user),
        senderName: userDisplayName(user),
        senderRole: roleForUser(user),
        status: 'sent'
      });
      setDraft('');
    } catch (err) {
      notify(err.message || 'Message was not sent');
    }
  }

  return (
    <section className="tracking-layout">
      <Panel title="Threads" eyebrow="Shipments">
        <div className="tracking-list">
          {bookingsQuery.isPending ? <AsyncState compact title="Loading conversations..." /> : null}
          {bookingsQuery.isError ? (
            <AsyncState
              compact
              title="Conversations could not be loaded"
              detail={bookingsQuery.error?.message}
              onRetry={() => bookingsQuery.refetch()}
            />
          ) : null}
          {!bookingsQuery.isPending && !bookingsQuery.isError
            ? shipments.map((item) => {
                const identity = String(item.bookingId || item.id);
                return (
                  <button
                    className={identity === String(messageKey) ? 'active' : ''}
                    type="button"
                    key={identity}
                    onClick={() => setSelectedId(identity)}
                  >
                    <strong>{item.id}</strong>
                    <span>{item.route}</span>
                    <small>{item.status}</small>
                  </button>
                );
              })
            : null}
          {!bookingsQuery.isPending && !bookingsQuery.isError && !shipments.length ? (
            <EmptyState title="No messages" detail="Messages attach to synced shipment records." />
          ) : null}
        </div>
      </Panel>
      <Panel title={shipment?.route || 'Messages'} eyebrow="In-house Text">
        <div className="chat-thread">
          {messagesQuery.isPending ? <AsyncState compact title="Loading message history..." /> : null}
          {messagesQuery.isError ? (
            <AsyncState
              compact
              title="Message history could not be loaded"
              detail={messagesQuery.error?.message}
              onRetry={() => messagesQuery.refetch()}
            />
          ) : null}
          {!messagesQuery.isPending && !messagesQuery.isError
            ? messages.map((message) => <ChatBubble message={message} key={message.id} />)
            : null}
          {!messagesQuery.isPending && !messagesQuery.isError && shipment && !messages.length ? (
            <EmptyState title="No messages in this thread" detail="Send the first update for this shipment." />
          ) : null}
          {!shipment && !bookingsQuery.isPending ? (
            <EmptyState title="Select a shipment" detail="A synced shipment is required before messaging." />
          ) : null}
        </div>
        <form className="chat-compose" onSubmit={sendMessage}>
          <input
            value={draft}
            disabled={!shipment || sendMessageMutation.isPending}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Type a message..."
          />
          <button
            className="primary"
            type="submit"
            aria-label={sendMessageMutation.isPending ? 'Sending message' : 'Send message'}
            disabled={!shipment || !draft.trim() || sendMessageMutation.isPending}
          >
            <Send size={18} />
          </button>
        </form>
      </Panel>
    </section>
  );
}
