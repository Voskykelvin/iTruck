export default function Panel({ title, eyebrow, action, onAction, children }) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h2>{title}</h2>
        </div>
        {action ? (
          <button className="text-button" type="button" onClick={onAction}>
            {action}
          </button>
        ) : null}
      </div>
      {children}
    </section>
  );
}
