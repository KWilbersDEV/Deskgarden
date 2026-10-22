import { useEffect, useRef, type ReactNode } from 'react';

type Props = {
  labelledBy: string;
  describedBy?: string;
  onClose: () => void;
  className?: string;
  children: ReactNode;
};

/** A centred modal dialog. Escape and the backdrop close it; focus returns to where it was. */
export function Modal({ labelledBy, describedBy, onClose, className = '', children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const returnTo = document.activeElement as HTMLElement | null;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      dialog?.close();
      // Only hand focus back if it would otherwise be lost.
      if (returnTo?.isConnected && (!document.activeElement || document.activeElement === document.body)) returnTo.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${className}`}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target !== ref.current) return;
        const r = ref.current.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose();
      }}
    >
      {children}
    </dialog>
  );
}
