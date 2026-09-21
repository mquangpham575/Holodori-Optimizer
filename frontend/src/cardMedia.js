import { useCallback, useState } from 'react';

// Card media helpers: per-visitor animation/signature preferences and voice prefetching.

// --- Preferences -----------------------------------------------------------

const storageGet = (key) => {
  try { return window.localStorage.getItem(key); } catch { return null; }
};
const storageSet = (key, value) => {
  try { window.localStorage.setItem(key, value); } catch { /* storage unavailable */ }
};
const prefersReducedMotion = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};
const readPref = (key, fallback) => {
  const v = storageGet(key);
  return v === 'on' ? true : v === 'off' ? false : fallback;
};

/** Animation and signature on/off, remembered between visits. Animation starts on
 *  unless the visitor asked their system for reduced motion. */
export function useStagePrefs() {
  const [animation, setAnimationState] = useState(() => readPref('holodreams_card_animation', !prefersReducedMotion()));
  const [signature, setSignatureState] = useState(() => readPref('holodreams_card_signature', true));
  const setAnimation = useCallback((next) => {
    setAnimationState(next);
    storageSet('holodreams_card_animation', next ? 'on' : 'off');
  }, []);
  const setSignature = useCallback((next) => {
    setSignatureState(next);
    storageSet('holodreams_card_signature', next ? 'on' : 'off');
  }, []);
  return { animation, signature, setAnimation, setSignature };
}

// --- Voice lines ---------------------------------------------------------------------

// The voice is about 1 MB. Start fetching it when the visitor reaches for the maximise
// button, and keep the element so the viewer can play it the moment it opens.
const voices = new Map();
export const warmVoice = (url) => {
  if (!url || typeof Audio !== 'function') return null;
  let audio = voices.get(url);
  if (!audio) {
    audio = new Audio();
    audio.preload = 'auto';
    audio.src = url;
    voices.set(url, audio);
    if (voices.size > 3) voices.delete(voices.keys().next().value);
  }
  return audio;
};
