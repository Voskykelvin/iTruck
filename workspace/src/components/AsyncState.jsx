export default function AsyncState({ title, detail, actionLabel = 'Try again', onRetry, compact = false }) {
  return (
    <section className={`async-state ${compact ? 'compact' : ''}`} role="alert">
      <strong>{title}</strong>
      {detail ? <p>{detail}</p> : null}
      {onRetry ? (
        <button className="ghost" type="button" onClick={onRetry}>
          {actionLabel}
        </button>
      ) : null}
    </section>
  );
}
