import { forwardRef } from 'react';

const Button = forwardRef(
  ({ children, variant = 'primary', size = 'md', className = '', loading = false, icon: Icon, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`btn btn-${variant} btn-${size} ${className}`}
        disabled={loading || props.disabled}
        {...props}
      >
        {loading ? (
          <span
            className="animate-spin"
            style={{
              width: '1em',
              height: '1em',
              border: '2px solid currentColor',
              borderRightColor: 'transparent',
              borderRadius: '50%'
            }}
          />
        ) : Icon ? (
          <Icon size={size === 'sm' ? 14 : size === 'lg' ? 20 : 16} />
        ) : null}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
export default Button;
