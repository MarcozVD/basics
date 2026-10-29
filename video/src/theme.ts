import { loadFont as loadGeist } from "@remotion/google-fonts/Geist";
import { loadFont as loadGeistMono } from "@remotion/google-fonts/GeistMono";

export const { fontFamily: sans } = loadGeist("normal", { weights: ["400", "500", "600", "700"], subsets: ["latin", "latin-ext"] });
export const { fontFamily: mono } = loadGeistMono("normal", { weights: ["400", "500", "600"], subsets: ["latin", "latin-ext"] });

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

export const color = {
  bg: "#07090d",
  panel: "#111318",
  panelBorder: "rgba(255,255,255,0.09)",
  text: "#f2f4f8",
  muted: "#8b93a3",
  blue: "#1a7cff",
  blueSoft: "#5aa2ff",
  violet: "#8b5cf6",
  green: "#3ddc84",
  amber: "#f5a524",
  red: "#ff5c6c",
};

/** App window geometry on the 1920×1080 canvas (content is the 1280×820 webview, scaled). */
export const APP = { width: 1280, height: 820, scale: 1.1, titleBar: 38, top: 22 };
export const APP_W = APP.width * APP.scale;
export const APP_H = APP.height * APP.scale;
export const APP_LEFT = (WIDTH - APP_W) / 2;

/** Where the webview sits inside the Recordly window capture (Windows title bar above it). */
export const FOOTAGE = { src: "footage/ui.mp4", width: 1282, height: 852, contentX: 2, contentY: 31, syncSeconds: 493 / 30 };
