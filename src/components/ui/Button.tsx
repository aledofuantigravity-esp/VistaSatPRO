'use client';

import type { ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'accent' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  className = '',
  children,
  disabled,
  ...props
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-2 font-bold uppercase tracking-wider rounded-none transition-colors focus:outline-none focus:ring-2 focus:ring-navy disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer';

  const variants = {
    primary: 'bg-navy text-white hover:bg-navy-dark active:opacity-90',
    accent: 'bg-magenta text-white hover:bg-magenta-dark active:opacity-90',
    secondary: 'bg-transparent border-2 border-navy text-navy hover:bg-navy/5',
    danger: 'bg-danger text-white hover:opacity-90',
    ghost: 'bg-transparent text-dark-grey hover:bg-charcoal/5',
  };

  const sizes = {
    sm: 'px-3 py-2 text-xs min-h-[40px]',
    md: 'px-5 py-3 text-sm min-h-[48px]',
    lg: 'px-6 py-4 text-sm min-h-[52px]',
  };

  return (
    <button
      disabled={disabled || isLoading}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {isLoading && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  );
}
