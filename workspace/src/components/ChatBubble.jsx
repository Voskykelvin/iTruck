import { formatMessageTime } from '../utils/helpers.js';

export default function ChatBubble({ message }) {
  const mine = message.author === 'me';

  return (
    <div className={`chat-message ${mine ? 'me' : 'them'}`} key={message.id}>
      <small>
        <strong>{mine ? 'You' : message.name || 'Counterparty'}</strong>
        <span>{formatMessageTime(message.createdAt)}</span>
      </small>
      <p>{message.text}</p>
    </div>
  );
}
