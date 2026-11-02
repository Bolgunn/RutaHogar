import { useEffect, useRef } from "react";

// Shared keyboard behavior for staff dialogs; only the top dialog handles focus.
export default function useModalFocus(open, onClose) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    const topDialog = () => [...document.querySelectorAll('.admin-modal [role="dialog"]')].at(-1);
    const dialog = topDialog();
    if (!dialog) return undefined;
    const focusables = () => [...dialog.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex="-1"])')]
      .filter((element) => element.getClientRects().length && !element.closest('[hidden], [aria-hidden="true"]'));
    dialog.tabIndex = -1;
    (focusables()[0] || dialog).focus({ preventScroll: true });
    const onKeyDown = (event) => {
      if (topDialog() !== dialog) return;
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        closeRef.current?.();
      }
      if (event.key !== "Tab") return;
      const items = focusables();
      const first = items[0] || dialog;
      const last = items.at(-1) || dialog;
      if (!items.length || !dialog.contains(document.activeElement) || (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus({ preventScroll: true });
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [open]);
}
