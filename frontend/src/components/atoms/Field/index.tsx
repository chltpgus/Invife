'use client';

import { type ReactNode } from 'react';

interface FieldProps {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string | null;
  children: ReactNode;
}

const Field =({
  id,
  label,
  required,
  hint,
  error,
  children,
}: FieldProps) => {
  const errorId = `${id}-error`;
  return (
    <div className="ed-field">
      <label htmlFor={id}>
        {label}
        {required ? <span className="ed-req"> 필수</span> : null}
      </label>
      {children}
      {error ? (
        <p id={errorId} className="ed-error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="ed-hint">{hint}</p>
      ) : null}
    </div>
  );
}

export default Field;

export function describedBy(error: string | null | undefined, id: string): string | undefined {
  return error ? `${id}-error` : undefined;
}
