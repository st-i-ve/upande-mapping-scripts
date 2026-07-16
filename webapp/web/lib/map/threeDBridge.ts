/**
 * Bridge from the React sidebar to the 3D iframe (legacy-3d.html). The iframe
 * registers its window on load; the sidebar posts control commands that the
 * iframe's mapperBridge applies to its (now hidden) on-canvas controls, and
 * the iframe relays status/feedback text back.
 *
 * Kept in its own non-persisted store because the handle closes over live
 * window objects, which must never land in the persisted app store.
 */
import { create } from "zustand";

type Msg =
  | { __mapper: true; kind: "set"; id: string; value: string | number | boolean }
  | { __mapper: true; kind: "click"; id: string }
  | { __mapper: true; kind: "trees"; text: string[] }
  | { __mapper: true; kind: "valves"; text: string[] };

interface ThreeDBridge {
  win: Window | null;
  ready: boolean;
  status: Record<string, string>;
  setWin: (w: Window | null) => void;
  setReady: (r: boolean) => void;
  setStatus: (id: string, text: string) => void;
  set: (id: string, value: string | number | boolean) => void;
  click: (id: string) => void;
  loadTrees: (texts: string[]) => void;
  loadValves: (texts: string[]) => void;
}

function post(win: Window | null, msg: Msg) {
  win?.postMessage(msg, "*");
}

export const useThreeD = create<ThreeDBridge>((set, get) => ({
  win: null,
  ready: false,
  status: {},
  setWin: (win) => set({ win }),
  setReady: (ready) => set({ ready }),
  setStatus: (id, text) => set((s) => ({ status: { ...s.status, [id]: text } })),
  set: (id, value) => post(get().win, { __mapper: true, kind: "set", id, value }),
  click: (id) => post(get().win, { __mapper: true, kind: "click", id }),
  loadTrees: (text) => post(get().win, { __mapper: true, kind: "trees", text }),
  loadValves: (text) => post(get().win, { __mapper: true, kind: "valves", text }),
}));
