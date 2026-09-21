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
// A visitor on a metered or very slow connection (Data Saver, 2G) should not have
// megabytes of video fetched for them unasked.
export const constrainedNetwork = () => {
  try {
    const c = navigator.connection;
    return Boolean(c && (c.saveData || /^(slow-2g|2g)$/.test(c.effectiveType || '')));
  } catch { return false; }
};
const readPref = (key, fallback) => {
  const v = storageGet(key);
  return v === 'on' ? true : v === 'off' ? false : fallback;
};

/** Animation and signature on/off, remembered between visits. Animation starts on
 *  unless the visitor asked their system for reduced motion or is on a constrained
 *  connection (an explicit choice, once made, always wins). */
export function useStagePrefs() {
  const [animation, setAnimationState] = useState(() => readPref('holodreams_card_animation', !prefersReducedMotion() && !constrainedNetwork()));
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

// --- Warming the videos ------------------------------------------------------------

// Reaching for a card is the cue to start fetching its videos, so they are (partly)
// in the browser cache by the time the card opens. Deliberately modest: only cards the
// pointer rests on, two downloads at a time, a cap per visit, nothing on a constrained
// connection, and only the layers the visitor has switched on.
const WARM_DELAY_MS = 150;
const WARM_CONCURRENCY = 2;
const WARM_LIMIT = 30;
const warmed = new Set();
const warmQueue = [];
let warming = 0;

const pumpWarmQueue = () => {
  while (warming < WARM_CONCURRENCY && warmQueue.length > 0) {
    const url = warmQueue.shift();
    warming += 1;
    fetch(url, { mode: 'no-cors', credentials: 'omit', priority: 'low' })
      // Drain our own copy; a redirect to the CDN comes back opaque and needs no reading.
      .then((res) => (res.type === 'basic' ? res.arrayBuffer() : undefined))
      .catch(() => { /* just a warm-up */ })
      .finally(() => { warming -= 1; pumpWarmQueue(); });
  }
};

export const warmMedia = (card, { animation = true, signature = true } = {}) => {
  if (typeof fetch !== 'function' || constrainedNetwork()) return;
  const urls = [animation && card?.videoUrl, signature && card?.signUrl].filter(Boolean);
  for (const url of urls) {
    if (warmed.has(url) || warmed.size >= WARM_LIMIT) continue;
    warmed.add(url);
    warmQueue.push(url);
  }
  pumpWarmQueue();
};

/** Props to spread on a card tile: warm its videos once the pointer rests on it, or it
 *  is focused or touched. Cards without media get no handlers. */
export const warmOnIntent = (card, prefs) => {
  if (!card?.videoUrl && !card?.signUrl) return {};
  let timer = 0;
  const start = () => { clearTimeout(timer); timer = setTimeout(() => warmMedia(card, prefs), WARM_DELAY_MS); };
  const cancel = () => clearTimeout(timer);
  return { onPointerEnter: start, onPointerLeave: cancel, onFocus: start, onBlur: cancel, onTouchStart: () => warmMedia(card, prefs) };
};
