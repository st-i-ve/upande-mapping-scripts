/**
 * In-app confirmation, in the console's own style — never the browser's
 * window.confirm. `await askConfirm({...})` resolves true on confirm, false on
 * cancel / Esc / clicking outside. One <ConfirmHost/> in the app shell shows it.
 */
import { create } from "zustand";

export interface ConfirmOptions {
  title: string;
  /** The detail under the title: what happens, and whether it can be undone. */
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** A destructive action: the confirm button is red. Default true. */
  danger?: boolean;
}

interface ConfirmState {
  request: (ConfirmOptions & { resolve: (ok: boolean) => void }) | null;
}

export const useConfirm = create<ConfirmState>(() => ({ request: null }));

export function askConfirm(opts: ConfirmOptions): Promise<boolean> {
  // A new question answers any open one with "no" rather than leaving it hanging.
  useConfirm.getState().request?.resolve(false);
  return new Promise((resolve) => useConfirm.setState({ request: { danger: true, ...opts, resolve } }));
}

export function answerConfirm(ok: boolean) {
  const req = useConfirm.getState().request;
  if (!req) return;
  useConfirm.setState({ request: null });
  req.resolve(ok);
}
