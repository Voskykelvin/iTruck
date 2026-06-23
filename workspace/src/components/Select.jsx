export default function Select({ label, value, onChange, options, emptyLabel }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option || 'empty'} value={option}>
            {option || emptyLabel || 'All'}
          </option>
        ))}
      </select>
    </label>
  );
}
