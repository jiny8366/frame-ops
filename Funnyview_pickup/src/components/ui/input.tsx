import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils/cn';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, hint, error, id, ...props }, ref) => {
    const inputId = id ?? props.name;
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-gray-700">
            {label}
          </label>
        )}
        <input
          id={inputId}
          ref={ref}
          className={cn(
            'h-10 rounded-lg border border-gray-300 px-3 text-sm outline-none transition',
            'focus:border-brand-600 focus:ring-2 focus:ring-brand-100',
            error && 'border-red-500 focus:border-red-500 focus:ring-red-100',
            className,
          )}
          {...props}
        />
        {error ? (
          <p className="text-xs text-red-600">{error}</p>
        ) : hint ? (
          <p className="text-xs text-gray-500">{hint}</p>
        ) : null}
      </div>
    );
  },
);
Input.displayName = 'Input';
