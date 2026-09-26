import type { ReactNode } from 'react';
import { errorIdFor, type RecipeFormErrors } from '../lib/recipe-form';

// ─── Layout primitives shared by /recipes/new and /recipes/[id]/edit ─────────
// Every control gets a programmatic name (F-X-5-1, F-REC-3-7): `Field` renders
// a real `<label htmlFor>` for single inputs, or a labelled `role="group"` for
// chip rows, and puts the error text at `errorIdFor(id)` so the control can
// point `aria-describedby` at it.

export function Section({
  title,
  children,
  error,
  errorId,
}: {
  title: string;
  children: ReactNode;
  error?: string | undefined;
  /** Id for the section-level error text; controls reference it via aria-describedby. */
  errorId?: string | undefined;
}) {
  return (
    <div>
      <h2 className="mb-4 border-b pb-2 font-semibold text-gray-900">{title}</h2>
      <div className="space-y-4">{children}</div>
      {error && (
        <p id={errorId} className="mt-2 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

export function Field({
  id,
  label,
  error,
  group = false,
  children,
}: {
  /** Id of the labelled control (or the group, when `group`). */
  id: string;
  label: string;
  error?: string | undefined;
  /** Chip rows and other multi-control fields: label a `role="group"` instead of one input. */
  group?: boolean;
  children: ReactNode;
}) {
  const errorText = error && (
    <p id={errorIdFor(id)} className="mt-1 text-xs text-red-600">
      {error}
    </p>
  );

  if (group) {
    const labelId = `${id}-label`;
    return (
      <div
        id={id}
        role="group"
        aria-labelledby={labelId}
        aria-describedby={error ? errorIdFor(id) : undefined}
      >
        <span id={labelId} className="mb-1 block text-xs font-medium text-gray-600">
          {label}
        </span>
        {children}
        {errorText}
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-gray-600">
        {label}
      </label>
      {children}
      {errorText}
    </div>
  );
}

/**
 * Announced once on a failed submit (and as the count changes). Sits next to
 * the Save button, where the user is when validation fails.
 */
export function FormErrorSummary({ errors }: { errors: RecipeFormErrors }) {
  const count = Object.keys(errors).length;
  return (
    <div role="alert" aria-atomic="true">
      {count > 0 && (
        <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Recipe not saved — {count === 1 ? '1 field needs' : `${count} fields need`} attention.
        </p>
      )}
    </div>
  );
}

export function inputCls(hasError: boolean) {
  return `w-full rounded-xl border bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none ${
    hasError ? 'border-red-400 focus:border-red-500' : 'focus:border-[#944a00]'
  }`;
}
