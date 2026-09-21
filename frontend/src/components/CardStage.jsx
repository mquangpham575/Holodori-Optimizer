import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, Volume2, VolumeX, X } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import CardArt from './CardArt';
import './CardStage.css';

// --- Signature overlay ------------------------------------------------------
//
// --- Signature overlay ------------------------------------------------------
//
// The signature is a "stacked alpha" video: the colour picture is the top half of
// every frame and its transparency matte (white = opaque) the bottom half. The CDN
// does not let other sites read its files from script, so we cannot decode the
// pixels ourselves (a WebGL texture from that video is refused). Drawing a video
// into a canvas is still allowed, though, and the browser's compositor can combine
// canvases without any pixel ever being read back. With m = matte and c = colour:
//
//   backdrop * (1 - m)   canvas 1: the matte, inverted, blended with "multiply"
//   + c * m              group:    colour x matte ("multiply"), added with "plus-lighter"
//
// which is ordinary alpha compositing of a straight-alpha picture. All three
// canvases are painted from the same video element, so they cannot drift apart.

const playMuted = (video) => {
  video.muted = true;
  const p = video.play();
  if (p && typeof p.catch === 'function') p.catch(() => { /* autoplay refused: stays on the first frame */ });
};

function SignatureLayer({ src, master, onError }) {
  const videoRef = useRef(null);
  const colorRef = useRef(null);
  const maskRef = useRef(null);
  const cutoutRef = useRef(null);
  // Parents pass a fresh callback every render; keep effects from restarting on it.
  const errorRef = useRef(onError);
  errorRef.current = onError;

  // Paint the two halves of every video frame into the two canvases.
  useEffect(() => {
    const video = videoRef.current;
    const color = colorRef.current;
    const mask = maskRef.current;
    const cutout = cutoutRef.current;
    if (!video || !color || !mask || !cutout) return undefined;
    const colorCtx = color.getContext('2d');
    const maskCtx = mask.getContext('2d');
    const cutoutCtx = cutout.getContext('2d');
    if (!colorCtx || !maskCtx || !cutoutCtx) { errorRef.current?.(); return undefined; }

    let stopped = false;
    let handle = 0;
    const useFrameCallback = typeof video.requestVideoFrameCallback === 'function';

    const paint = () => {
      if (video.readyState < 2 || !video.videoWidth) return;
      const w = video.videoWidth;
      const h = Math.floor(video.videoHeight / 2);
      if (color.width !== w || color.height !== h) {
        for (const c of [color, mask, cutout]) { c.width = w; c.height = h; }
      }
      try {
        colorCtx.drawImage(video, 0, 0, w, h, 0, 0, w, h);
        maskCtx.drawImage(video, 0, h, w, h, 0, 0, w, h);
        cutoutCtx.drawImage(video, 0, h, w, h, 0, 0, w, h);
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
      <div className="card-sign-glow" aria-hidden="true">
        <canvas ref={colorRef} className="card-sign-color" />
        <canvas ref={maskRef} className="card-sign-mask" />
      </div>
    </>
  );
}

// --- The art stage ------------------------------------------------------------

/** Card illustration with the optional looping animation and signature on top. */
export function CardStage({ card, animation, signature, onAnimationError, onSignatureError, className = '' }) {
  const [animEl, setAnimEl] = useState(null);
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
  animationOk, signatureOk, onAnimationError, onSignatureError, onClose,
}) {
  const { t } = useLanguage();
  const audioRef = useRef(null);
  const [muted, setMuted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [audioFailed, setAudioFailed] = useState(false);
  const hasVoice = Boolean(card.voiceUrl) && !audioFailed;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;
    const p = audio.play();
    if (p && typeof p.catch === 'function') p.catch(() => setPlaying(false));
    return () => audio.pause();
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
      {card.voiceUrl && (
        <audio
          ref={audioRef}
          src={card.voiceUrl}
          preload="auto"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onError={() => setAudioFailed(true)}
        />
      )}
    </div>,
    document.body
  );
}

export function ExpandButton({ onClick }) {
  const { t } = useLanguage();
  return (
    <button type="button" className="card-expand-btn" onClick={onClick} aria-label={t('view_larger')} title={t('view_larger')}>
      <Maximize2 size={16} />
    </button>
  );
}
