/// <reference types="vite/client" />

import type { FrameBridgeApi } from "../preload/preload";

declare global {
  interface Window {
    framebridge: FrameBridgeApi;
  }
}
