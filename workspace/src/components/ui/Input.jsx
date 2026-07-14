import { forwardRef, useId } from 'react';

const Input = forwardRef(({ label, error, helperText, className = '', containerStyle = {}, ...props }, ref) => {
  const generatedId = useId();
  const inputId = props.id || generatedId;
  const messageId = `${inputId}-message`;
  return (
    <div className="input-group" style={containerStyle}>
      {label && (
        <label className="input-label" htmlFor={inputId}>
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        className={`input-field ${error ? 'input-error' : ''} ${className}`}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error || helperText ? messageId : undefined}
        {...props}
      />
      {(error || helperText) && (
        <span id={messageId} className={`input-message ${error ? 'error' : ''}`}>
          {error || helperText}
        </span>
      )}
    </div>
  );
});

Input.displayName = 'Input';
export default Input;
