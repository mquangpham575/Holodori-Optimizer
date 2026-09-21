import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, Volume2, VolumeX, X } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import CardArt from './CardArt';
import { warmVoice } from '../cardMedia';
import './CardStage.css';

// --- Signature overlay ------------------------------------------------------
//
// The signature is a "stacked alpha" video: the colour picture is the top half of
// every frame and its transparency matte (white = opaque) the bottom half. The CDN
// does not let other sites read its files from script, so we cannot decode the
// pixels ourselves (a WebGL texture from that video is refused). Drawing a video
// into a canvas is still allowed, though, and the browser's compositor can combine
// canvases without any pixel ever being read back. With m = matte and c = colour:
//
//   backdrop * (1 - m)   canvas "cutout": the inverted matte, blended with "multiply"
//   + c * m              canvas "color":  colour x matte, added with "plus-lighter"
//
// which is ordinary alpha compositing of a straight-alpha picture. Both canvases are
// painted from the same video element, so they cannot drift apart, and they are only
// as large as the picture is shown (never the full 1280 px inside a small card).

const playMuted = (video) => {
  video.muted = true;
  const p = video.play();
  if (p && typeof p.catch === 'function') p.catch(() => { /* autoplay refused: stays on the first frame */ });
};

function SignatureLayer({ src, master, onError }) {
  const videoRef = useRef(null);
  const colorRef = useRef(null);
  const cutoutRef = useRef(null);
  // Parents pass a fresh callback every render; keep effects from restarting on it.
  const errorRef = useRef(onError);
  errorRef.current = onError;

  // Paint the two halves of every video frame into the two canvases.
  useEffect(() => {
    const video = videoRef.current;
    const color = colorRef.current;
    const cutout = cutoutRef.current;
    if (!video || !color || !cutout) return undefined;
    const colorCtx = color.getContext('2d');
    const cutoutCtx = cutout.getContext('2d');
    if (!colorCtx || !cutoutCtx) { errorRef.current?.(); return undefined; }

    // Draw at the size the picture is displayed (device pixels, at most the video's own).
    const shown = { width: 0 };
    const stage = color.parentElement;
    const observer = typeof ResizeObserver === 'function' && stage
      ? new ResizeObserver(([entry]) => {
        shown.width = Math.round(entry.contentRect.width * Math.min(window.devicePixelRatio || 1, 2));
      })
      : null;
    observer?.observe(stage);

    let stopped = false;
    let handle = 0;
    const useFrameCallback = typeof video.requestVideoFrameCallback === 'function';

    const paint = () => {
      if (video.readyState < 2 || !video.videoWidth) return;
      const w = video.videoWidth;
      const h = Math.floor(video.videoHeight / 2);
      const dw = Math.max(64, Math.min(w, shown.width || w));
      const dh = Math.round((dw * h) / w);
      if (color.width !== dw || color.height !== dh) {
        color.width = dw; color.height = dh;
        cutout.width = dw; cutout.height = dh;
      }
      try {
        // c * m
        colorCtx.globalCompositeOperation = 'source-over';
        colorCtx.drawImage(video, 0, 0, w, h, 0, 0, dw, dh);
        colorCtx.globalCompositeOperation = 'multiply';
        colorCtx.drawImage(video, 0, h, w, h, 0, 0, dw, dh);
        // 1 - m
        cutoutCtx.globalCompositeOperation = 'source-over';
        cutoutCtx.drawImage(video, 0, h, w, h, 0, 0, dw, dh);
        cutoutCtx.globalCompositeOperation = 'difference';
        cutoutCtx.fillStyle = '#fff';
        cutoutCtx.fillRect(0, 0, dw, dh);
      } catch { /* frame not decodable yet */ }
    };
    const loop = () => {
      if (stopped) return;
      paint();
      handle = useFrameCallback ? video.requestVideoFrameCallback(loop) : requestAnimationFrame(loop);
    };
    handle = useFrameCallback ? video.requestVideoFrameCallback(loop) : requestAnimationFrame(loop);
    video.addEventListener('loadeddata', paint);
    video.addEventListener('seeked', paint);
    return () => {
      stopped = true;
      observer?.disconnect();
      if (useFrameCallback) video.cancelVideoFrameCallback?.(handle);
      else cancelAnimationFrame(handle);
      video.removeEventListener('loadeddata', paint);
      video.removeEventListener('seeked', paint);
    };
  }, [src]);

  // Playback: loop by itself, or (over the animation) restart whenever the
  // animation loops so the two stay together.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    video.muted = true;
    if (!master) {
      video.loop = true;
      playMuted(video);
      return undefined;
    }
    video.loop = false;
    const align = () => {
      if (Number.isFinite(video.duration) && master.currentTime < video.duration) {
        video.currentTime = master.currentTime;
      }
      playMuted(video);
    };
    let last = master.currentTime;
    const onTime = () => {
      const now = master.currentTime;
      if (now < last - 0.5) { video.currentTime = 0; playMuted(video); }
      last = now;
    };
    master.addEventListener('timeupdate', onTime);
    if (video.readyState >= 1) align();
    else video.addEventListener('loadedmetadata', align, { once: true });
    return () => {
      master.removeEventListener('timeupdate', onTime);
      video.removeEventListener('loadedmetadata', align);
    };
  }, [master, src]);

  return (
    <>
      <video
        ref={videoRef}
        className="card-sign-source"
        src={src}
        muted
        playsInline
        preload="auto"
        aria-hidden="true"
        tabIndex={-1}
        onError={onError}
      />
      <canvas ref={cutoutRef} className="card-sign-cutout" aria-hidden="true" />
      <canvas ref={colorRef} className="card-sign-color" aria-hidden="true" />
    </>
  );
}

// --- The art stage ------------------------------------------------------------

/** Card illustration with the optional looping animation and signature on top. */
export function CardStage({ card, animation, signature, onAnimationError, onSignatureError, className = '', timeRef, startAt = 0 }) {
  const [animEl, setAnimEl] = useState(null);
  // timeRef: where the animation currently is, written for whoever opens the next stage
  // (the maximised viewer carries on from there instead of restarting). startAt: the
  // position to begin at, used once.
  const resumeAt = useRef(startAt);
  const showAnimation = Boolean(animation && card.videoUrl);
  const showSignature = Boolean(signature && card.signUrl);
  return (
    <div className={`card-stage ${className}`.trim()}>
      <CardArt
        name={card.name}
        sources={[card.fullImage, card.image, card.fallbackImage]}
        className="card-stage-art"
      />
      {showAnimation && (
        <video
          ref={setAnimEl}
          className="card-stage-layer card-stage-video"
          src={card.videoUrl}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          onError={onAnimationError}
          onTimeUpdate={timeRef ? (e) => { timeRef.current = e.currentTarget.currentTime; } : undefined}
          onLoadedMetadata={(e) => {
            const video = e.currentTarget;
            if (resumeAt.current > 0 && resumeAt.current < video.duration) video.currentTime = resumeAt.current;
            resumeAt.current = 0;
          }}
        />
      )}
      {showSignature && (
        <SignatureLayer
          key={card.signUrl}
          src={card.signUrl}
          master={showAnimation ? animEl : null}
          onError={onSignatureError}
        />
      )}
    </div>
  );
}

// --- Toggles ----------------------------------------------------------------------

function Switch({ label, checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`card-switch${checked ? ' on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="card-switch-track" aria-hidden="true"><span className="card-switch-knob" /></span>
      <span>{label}</span>
    </button>
  );
}

export function StageToggles({ card, animation, signature, onAnimation, onSignature, animationOk = true, signatureOk = true }) {
  const { t } = useLanguage();
  return (
    <>
      {card.videoUrl && animationOk && <Switch label={t('animation')} checked={animation} onChange={onAnimation} />}
      {card.signUrl && signatureOk && <Switch label={t('signature')} checked={signature} onChange={onSignature} />}
    </>
  );
}

// --- Full-screen viewer ---------------------------------------------------------------

/** Maximised card. Plays the card's voice line as soon as it opens (the click that
 *  opened it counts as the user gesture browsers require), with a sound button.
 *  Escape is handled by the owner so it can close this before the card dialog. */
export function CardViewer({
  card, animation, signature, onAnimation, onSignature,
  animationOk, signatureOk, onAnimationError, onSignatureError, onClose, timeRef,
}) {
  const { t } = useLanguage();
  const hostRef = useRef(null);
  const audioRef = useRef(null);
  const resumeAt = useRef(timeRef?.current || 0);
  const [muted, setMuted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [audioFailed, setAudioFailed] = useState(false);
  const hasVoice = Boolean(card.voiceUrl) && !audioFailed;

  // The voice element comes from the cache (usually already buffered by hovering the
  // maximise button) and is parked in the viewer so it is part of the dialog.
  useEffect(() => {
    const audio = warmVoice(card.voiceUrl);
    const host = hostRef.current;
    if (!audio || !host) return undefined;
    audioRef.current = audio;
    host.appendChild(audio);
    const on = { play: () => setPlaying(true), pause: () => setPlaying(false), ended: () => setPlaying(false), error: () => setAudioFailed(true) };
    for (const [name, fn] of Object.entries(on)) audio.addEventListener(name, fn);
    if (audio.error) setAudioFailed(true);
    audio.muted = false;
    audio.currentTime = 0;
    const p = audio.play();
    if (p && typeof p.catch === 'function') p.catch(() => setPlaying(false));
    return () => {
      for (const [name, fn] of Object.entries(on)) audio.removeEventListener(name, fn);
      audio.pause();
      audio.remove();
      audioRef.current = null;
    };
  }, [card.voiceUrl]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = muted;
  }, [muted]);

  const toggleSound = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused || audio.ended) {
      if (audio.ended) audio.currentTime = 0;
      audio.muted = false;
      setMuted(false);
      const p = audio.play();
      if (p && typeof p.catch === 'function') p.catch(() => setPlaying(false));
    } else {
      setMuted((m) => !m);
    }
  };

  const soundOn = playing && !muted;
  const soundLabel = soundOn ? t('mute') : playing ? t('unmute') : t('play_voice');

  return createPortal(
    <div
      className="card-viewer"
      role="dialog"
      aria-modal="true"
      aria-label={`${card.name} — ${card.title}`}
      onClick={onClose}
    >
      <button type="button" className="card-viewer-close" onClick={onClose} aria-label={t('close')} autoFocus>
        <X size={22} />
      </button>
      <div className="card-viewer-body" onClick={(e) => e.stopPropagation()}>
        <div className="card-viewer-stage">
          <CardStage
            card={card}
            animation={animation}
            signature={signature}
            onAnimationError={onAnimationError}
            onSignatureError={onSignatureError}
            startAt={resumeAt.current}
          />
        </div>
        <div className="card-viewer-bar">
          <StageToggles
            card={card}
            animation={animation}
            signature={signature}
            onAnimation={onAnimation}
            onSignature={onSignature}
            animationOk={animationOk}
            signatureOk={signatureOk}
          />
          {hasVoice && (
            <button
              type="button"
              className={`card-sound-btn${soundOn ? ' on' : ''}`}
              onClick={toggleSound}
              aria-label={soundLabel}
              title={soundLabel}
            >
              {soundOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>
          )}
        </div>
      </div>
      <div ref={hostRef} hidden />
    </div>,
    document.body
  );
}

export function ExpandButton({ card, onClick }) {
  const { t } = useLanguage();
  const warm = () => warmVoice(card?.voiceUrl);
  return (
    <button
      type="button"
      className="card-expand-btn"
      onClick={onClick}
      onPointerEnter={warm}
      onFocus={warm}
      onTouchStart={warm}
      aria-label={t('view_larger')}
      title={t('view_larger')}
    >
      <Maximize2 size={16} />
    </button>
  );
}
