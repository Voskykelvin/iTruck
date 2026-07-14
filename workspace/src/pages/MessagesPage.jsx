import { useState, useEffect, useRef } from 'react';
import { useBookings } from '../queries/commercial';
import { useSessionBootstrap } from '../queries/session';
import { useMessages, useSendMessage } from '../queries/conversations';
import { MessageSquare, Send, Package, MapPin, Loader2 } from 'lucide-react';
import Card from '../components/ui/Card';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import Badge from '../components/ui/Badge';
import { formatMessageTime } from '../utils/helpers';

export default function MessagesPage() {
  const { data: user } = useSessionBootstrap();
  const { data: shipments = [], isLoading: isLoadingShipments } = useBookings();

  const [selectedBookingId, setSelectedBookingId] = useState(null);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef(null);

  const activeShipments = shipments.filter((s) => !['cancelled'].includes(s.rawStatus));
  const selectedShipment = activeShipments.find((s) => s.id === selectedBookingId);

  const { data: messages = [], isLoading: isLoadingMessages } = useMessages(selectedBookingId, user);
  const { mutate: sendMessage, isPending: isSending } = useSendMessage(user);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedBookingId) return;

    sendMessage(
      { booking: selectedBookingId, text: newMessage.trim() },
      {
        onSuccess: () => setNewMessage('')
      }
    );
  };

  return (
    <div
      className="animate-fade-in stack-lg h-full"
      style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 100px)' }}
    >
      <div className="page-header">
        <div>
          <h1 className="page-title">Messages</h1>
          <p className="text-secondary">Communicate with your logistics partners.</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-4)', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar: Shipment List */}
        <Card style={{ width: '320px', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600 }}>Conversations</h3>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {isLoadingShipments ? (
              <div style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--text-muted)' }}>
                Loading...
              </div>
            ) : activeShipments.length === 0 ? (
              <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)' }}>
                No active shipments found.
              </div>
            ) : (
              activeShipments.map((shipment) => (
                <div
                  key={shipment.id}
                  onClick={() => setSelectedBookingId(shipment.id)}
                  style={{
                    padding: 'var(--space-4)',
                    borderBottom: '1px solid var(--border)',
                    cursor: 'pointer',
                    background: selectedBookingId === shipment.id ? 'var(--bg-hover)' : 'transparent',
                    transition: 'background 0.2s ease'
                  }}
                >
                  <div className="row-between" style={{ marginBottom: 'var(--space-2)' }}>
                    <span className="mono text-muted" style={{ fontSize: 'var(--text-xs)' }}>
                      {shipment.id.substring(0, 8)}
                    </span>
                    <Badge variant={shipment.rawStatus === 'delivered' ? 'success' : 'info'} size="sm">
                      {shipment.status}
                    </Badge>
                  </div>
                  <div className="row text-sm" style={{ fontWeight: 500 }}>
                    <MapPin size={14} color="var(--brand)" />
                    <span className="truncate">
                      {shipment.origin} &rarr; {shipment.destination}
                    </span>
                  </div>
                  <div className="text-xs text-secondary mt-1 truncate">{shipment.cargo}</div>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Main Content: Chat Window */}
        <Card style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
          {!selectedBookingId ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <EmptyState
                icon={MessageSquare}
                title="Your Messages"
                description="Select a shipment from the sidebar to view or send messages."
              />
            </div>
          ) : (
            <>
              {/* Chat Header */}
              <div
                style={{
                  padding: 'var(--space-4)',
                  borderBottom: '1px solid var(--border)',
                  background: 'var(--surface)'
                }}
              >
                <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600 }}>
                  Chat for Shipment {selectedShipment?.id.substring(0, 8)}
                </h3>
                <p className="text-sm text-secondary">
                  {selectedShipment?.origin} &rarr; {selectedShipment?.destination}
                </p>
              </div>

              {/* Chat Messages */}
              <div
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: 'var(--space-6)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-4)'
                }}
              >
                {isLoadingMessages ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-8)' }}>
                    <Loader2 className="animate-spin" color="var(--brand)" />
                  </div>
                ) : messages.length === 0 ? (
                  <div
                    style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: 'auto', marginBottom: 'auto' }}
                  >
                    <Package size={32} style={{ margin: '0 auto var(--space-2)', opacity: 0.5 }} />
                    <p>No messages yet.</p>
                    <p className="text-xs">Start the conversation below.</p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isMe = msg.author === 'me';
                    return (
                      <div
                        key={msg.id || msg._id}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: isMe ? 'flex-end' : 'flex-start',
                          maxWidth: '70%',
                          alignSelf: isMe ? 'flex-end' : 'flex-start'
                        }}
                      >
                        <div
                          style={{
                            background: isMe ? 'var(--brand)' : 'var(--bg-hover)',
                            color: isMe ? 'white' : 'var(--text)',
                            padding: 'var(--space-3) var(--space-4)',
                            borderRadius: '12px',
                            borderBottomRightRadius: isMe ? 0 : '12px',
                            borderBottomLeftRadius: isMe ? '12px' : 0,
                            fontSize: 'var(--text-sm)',
                            lineHeight: 1.5
                          }}
                        >
                          {msg.text}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                          {!isMe && <span style={{ fontWeight: 500, marginRight: '4px' }}>{msg.name}</span>}
                          {formatMessageTime(msg.createdAt)}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Chat Input */}
              <div
                style={{
                  padding: 'var(--space-4)',
                  borderTop: '1px solid var(--border)',
                  background: 'var(--surface)'
                }}
              >
                <form onSubmit={handleSend} style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  <Input
                    style={{ flex: 1, margin: 0 }}
                    placeholder="Type your message..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    disabled={isSending}
                  />
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={!newMessage.trim() || isSending}
                    style={{ width: '48px', padding: 0 }}
                  >
                    {isSending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                  </Button>
                </form>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
