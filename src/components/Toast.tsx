'use client';

import React from 'react';
import { X } from 'lucide-react';

export type ToastKind = 'success' | 'error';

export interface ToastMessage {
  kind: ToastKind;
  message: string;
}

export interface ToastProps {
  kind: ToastKind;
  message: string;
  onDismiss: () => void;
}

export default function Toast({ kind, message, onDismiss }: ToastProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-6 right-6 z-50 w-80 px-4 py-3 rounded-lg border shadow-lg text-sm transition-all ${
        kind === 'success'
          ? 'bg-zinc-900 border-teal-500/30 text-zinc-200'
          : 'bg-zinc-900 border-red-500/30 text-red-400'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <span>{message}</span>
        <button
          onClick={onDismiss}
          aria-label="Dismiss notification"
          className="text-zinc-600 hover:text-zinc-400 flex-shrink-0"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
