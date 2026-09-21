import { useEffect, useRef, useState } from 'react';

// Module-level so the component type stays stable across renders (defining it
// inside another component would remount the <img> and reset the error state each
// render, causing broken images to retry endlessly).
const getInitials = (name) => {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]).join('').toUpperCase();
};

// Tries each source in order (full illustration, then the bundled card art, then the
// member portrait) before falling back to initials, so a card whose artwork is not
// available yet still shows something sensible instead of a broken image.
// data-kind lets the CSS give the wide illustrations a 16:9 frame.
// onReady fires once something is on screen (an image loaded, or the initials
// fallback took over); eager skips lazy loading for art that is already in view.
const CardArt = ({ name, sources, alt, className, small, onReady, eager }) => {
  const list = (sources || []).filter((s, i, all) => s && all.indexOf(s) === i);
  const [index, setIndex] = useState(0);
  const exhausted = index >= list.length;
  const readyRef = useRef(onReady);
  readyRef.current = onReady;
  useEffect(() => {
    if (exhausted) readyRef.current?.();
  }, [exhausted]);
  if (exhausted) {
    return <div className={`card-art-initials${small ? ' small' : ''}`}>{getInitials(name)}</div>;
  }
  return (
    <img
      key={list[index]}
      src={list[index]}
      alt={alt || name}
      className={className}
      data-kind={index === 0 && /\/images\/cards-(full|thumb)\//.test(list[0]) ? 'wide' : 'framed'}
      loading={eager ? 'eager' : 'lazy'}
      onLoad={onReady}
      onError={() => setIndex((i) => i + 1)}
    />
  );
};

export default CardArt;
