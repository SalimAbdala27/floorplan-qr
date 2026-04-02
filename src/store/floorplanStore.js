import { useSyncExternalStore } from "react";

let state = {
  improving: false,
  error: null,
  lastPlan: null,
};

const listeners = new Set();

function emit() {
  listeners.forEach((listener) => listener());
}

export function getFloorplanStoreState() {
  return state;
}

export function setFloorplanStoreState(patch) {
  state = {
    ...state,
    ...patch,
  };
  emit();
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useFloorplanStore(selector = (s) => s) {
  return useSyncExternalStore(subscribe, () => selector(state));
}
