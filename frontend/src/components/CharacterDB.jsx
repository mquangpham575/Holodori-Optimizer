import { useLanguage } from '../context/LanguageContext';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  X, Users, Sparkles, Award, Zap, Shield, SlidersHorizontal, LayoutGrid, List,
  ArrowDownWideNarrow, ArrowUpNarrowWide, Link as LinkIcon, Check,
} from 'lucide-react';
import { ALL_CARDS } from '../data';
import { getTypeIconUrl } from '../charUtils';
import './CharacterDB.css';

const storageGet = (key) => {
  try { return window.localStorage.getItem(key); } catch { return null; }
};
const storageSet = (key, value) => {
  try { window.localStorage.setItem(key, value); } catch { /* storage unavailable */ }
};

// Module-level so the component type stays stable across renders (defining it
// inside the component would remount the <img> and reset the error state each
// render, causing broken images to retry endlessly).
const getInitials = (name) => {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]).join('').toUpperCase();
};

// Tries each source in order (card art, then the member portrait) before falling
// back to initials, so a card whose artwork is not published yet still shows
// the member instead of a blank tile.
const CardArt = ({ name, src, fallbackSrc, alt, className, small }) => {
  const sources = [src, fallbackSrc].filter((s, i, all) => s && all.indexOf(s) === i);
  const [index, setIndex] = useState(0);
  if (index >= sources.length) {
    return <div className={`card-art-initials${small ? ' small' : ''}`}>{getInitials(name)}</div>;
  }
  return (
    <img
      key={sources[index]}
      src={sources[index]}
      alt={alt || name}
      className={className}
      loading="lazy"
      onError={() => setIndex((i) => i + 1)}
    />
  );
};

const STAT_KEYS = ['performance', 'technique', 'sense'];
const STAT_LABEL_KEYS = {
  performance: 'stat_performance',
  technique: 'stat_technique',
  sense: 'stat_sense',
};

const GROUP_ORDER = [
  'Gen 0', 'Gen 1', 'Gen 2', 'GAMERS', 'Gen 3', 'Gen 4', 'Gen 5', 'holoX',
  'ID Gen 1', 'ID Gen 2', 'ID Gen 3', 'Myth', 'Promise', 'Advent', 'ReGLOSS',
];
const groupRank = (g) => {
  const i = GROUP_ORDER.indexOf(g);
  return i !== -1 ? i : 99;
};

const TYPE_DISPLAY = { PURE: 'Pure', CUTE: 'Cute', HAPPY: 'Happy' };
const TYPE_COLOR = { PURE: '#4caf50', CUTE: '#ff4d6d', HAPPY: '#ff9f1c' };
const getTypeColor = (type) => TYPE_COLOR[type] || '#4caf50';

const charGroupLabels = (char) => {
  const labels = new Set();
  if (char.group) labels.add(char.group);
  if (char.cardData?.groupLabels) char.cardData.groupLabels.forEach((l) => l && labels.add(l));
  if (char.groupLabels) (Array.isArray(char.groupLabels) ? char.groupLabels : [char.groupLabels]).forEach((l) => l && labels.add(l));
  return Array.from(labels).sort((a, b) => groupRank(a) - groupRank(b));
};

// Which of Performance/Technique/Sense a card leans on. The stat weights
// (permil) are the authoritative source; max stats are the fallback.
const mainStatOf = (card) => {
  const weights = card.cardData?.statPermil;
  const values = Array.isArray(weights) && weights.length === 3
    ? weights
    : STAT_KEYS.map((k) => card.stats?.[k] ?? 0);
  const max = Math.max(...values);
  return max > 0 ? STAT_KEYS[values.indexOf(max)] : null;
};

// Higher = released later. Asset ids end in "...-uniq-0081-00"; the counter
// grows with each release, which is what "Newest" sorts on.
const releaseOrder = (card) => {
  const m = String(card.assetId || card.id || '').match(/-(\d{3,4})-\d{2}$/);
  return m ? parseInt(m[1], 10) : 0;
};

const SORTERS = {
  rarity: (a, b) => b.rarityNum - a.rarityNum || releaseOrder(b) - releaseOrder(a),
  // Like the numeric sorters this orders "high to low" (Z to A), so the direction
  // toggle means the same thing for every key; choosing Name starts ascending.
  name: (a, b) => String(b.name).localeCompare(String(a.name)) || b.rarityNum - a.rarityNum,
  newest: (a, b) => releaseOrder(b) - releaseOrder(a),
  total: (a, b) => (b.stats?.total || 0) - (a.stats?.total || 0),
  performance: (a, b) => (b.stats?.performance || 0) - (a.stats?.performance || 0),
  technique: (a, b) => (b.stats?.technique || 0) - (a.stats?.technique || 0),
  sense: (a, b) => (b.stats?.sense || 0) - (a.stats?.sense || 0),
};
const SORT_OPTIONS = ['rarity', 'newest', 'name', 'total', 'performance', 'technique', 'sense'];

// Same rounding as the backend enrichment and the team builder.
const statsAt = (cd, bloom, level) => {
  const curve = cd?.levelBaseValues;
  const permil = cd?.statPermil;
  if (!Array.isArray(curve) || !curve.length || !Array.isArray(permil)) return null;
  const stage = (cd.bloomStages || []).find((s) => s.stage === bloom);
  const bonus = stage?.statBonus || 0;
  const base = curve[Math.min(Math.max(level, 1), curve.length) - 1];
  const [performance, technique, sense] = permil.map((p) => Math.ceil(base * (p / 1000) * (1 + bonus)));
  return { performance, technique, sense, total: performance + technique + sense };
};

const fmt = (n) => (Number.isFinite(n) ? n.toLocaleString('en-US') : '—');

const isNarrow = () => typeof window !== 'undefined' && window.matchMedia?.('(max-width: 768px)').matches;

export default function CharacterDB({ characters = [], allCards = [], ownedRoster = [] }) {
  const { t } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedGroup, setSelectedGroup] = useState('All');
  const [selectedType, setSelectedType] = useState('All');
  const [selectedRarity, setSelectedRarity] = useState('All');
  const [selectedStat, setSelectedStat] = useState('All');
  const [rosterOnly, setRosterOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState('rarity');
  const [sortDesc, setSortDesc] = useState(true);
  const [view, setView] = useState(() => (storageGet('holodreams_cards_view') === 'list' ? 'list' : 'grid'));
  const [filtersOpen, setFiltersOpen] = useState(() => !isNarrow());
  const [activeBloom, setActiveBloom] = useState(1);
  const [statBloom, setStatBloom] = useState(5);
  const [statLevel, setStatLevel] = useState(null);
  const [linkCopied, setLinkCopied] = useState(false);

  const displayList = useMemo(
    () => (allCards.length > 0 ? allCards : ALL_CARDS && ALL_CARDS.length > 0 ? ALL_CARDS : characters),
    [allCards, characters],
  );

  const ownedIds = useMemo(
    () => new Set((ownedRoster || []).map((e) => (typeof e === 'string' ? e : e?.id)).filter(Boolean)),
    [ownedRoster],
  );

  const groups = useMemo(() => {
    const present = Array.from(new Set(displayList.flatMap(charGroupLabels))).filter(Boolean);
    present.sort((a, b) => groupRank(a) - groupRank(b));
    return ['All', ...present];
  }, [displayList]);

  const types = ['All', 'PURE', 'CUTE', 'HAPPY'];
  const rarities = ['All', '5-Star', '4-Star', '3-Star'];
  const statFilters = ['All', ...STAT_KEYS];

  const activeFilterCount =
    (selectedGroup !== 'All') + (selectedType !== 'All') + (selectedRarity !== 'All') +
    (selectedStat !== 'All') + (rosterOnly ? 1 : 0);

  const clearFilters = () => {
    setSelectedGroup('All');
    setSelectedType('All');
    setSelectedRarity('All');
    setSelectedStat('All');
    setRosterOnly(false);
    setSearchQuery('');
  };

  const filteredCharacters = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = displayList.filter((char) => {
      if (selectedGroup !== 'All' && !charGroupLabels(char).includes(selectedGroup)) return false;
      if (selectedType !== 'All' && char.type !== selectedType) return false;
      if (
        selectedRarity !== 'All' &&
        char.rarity !== selectedRarity &&
        !(char.rarityNum && char.rarityNum === parseInt(selectedRarity, 10))
      ) return false;
      if (selectedStat !== 'All' && mainStatOf(char) !== selectedStat) return false;
      if (rosterOnly && !ownedIds.has(char.charId || char.id)) return false;
      if (q && !((char.name || '').toLowerCase().includes(q) || (char.title || '').toLowerCase().includes(q))) return false;
      return true;
    });
    const cmp = SORTERS[sortKey] || SORTERS.rarity;
    // Array.prototype.sort is stable, so ties keep the catalog order.
    return list.sort((a, b) => (sortDesc ? cmp(a, b) : -cmp(a, b)));
  }, [displayList, selectedGroup, selectedType, selectedRarity, selectedStat, rosterOnly, ownedIds, searchQuery, sortKey, sortDesc]);

  // The open card lives in the URL (?card=<assetId>) so a card can be linked to,
  // and the browser back button closes it.
  const cardParam = searchParams.get('card');
  const activeCharacter = useMemo(
    () => (cardParam ? displayList.find((c) => (c.assetId || c.id) === cardParam) || null : null),
    [cardParam, displayList],
  );

  const openCard = useCallback((char) => {
    const next = new URLSearchParams(searchParams);
    next.set('card', char.assetId || char.id);
    setSearchParams(next);
  }, [searchParams, setSearchParams]);

  const closeCard = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete('card');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // Reset per-card modal state whenever a different card opens.
  const activeKey = activeCharacter ? activeCharacter.assetId || activeCharacter.id : null;
  useEffect(() => {
    if (!activeKey) return;
    setActiveBloom(1);
    setStatBloom(5);
    setStatLevel(null);
    setLinkCopied(false);
  }, [activeKey]);

  useEffect(() => {
    if (!activeKey) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') closeCard(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeKey, closeCard]);

  const changeView = (next) => {
    setView(next);
    storageSet('holodreams_cards_view', next);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1800);
    } catch { /* clipboard unavailable (insecure context / denied) */ }
  };

  const getTypeIcon = (type) => {
    const url = getTypeIconUrl(type);
    if (!url) return null;
    return <img src={url} alt={`${type} type`} className="elem-icon" />;
  };

  // Card & Bloom data
  const cd = activeCharacter?.cardData || activeCharacter;
  const bloomStages = cd?.bloomStages || [];

  // Compute exact Bloom Card Display for stage (1..5) matching official in-game UI
  const getBloomCardDisplay = (lvl) => {
    if (!cd) return { badge: 'Parameter UP', badgeType: 'param', text: 'All Parameters 10% UP' };
    const stg = bloomStages[lvl] || {};
    const prev = bloomStages[lvl - 1] || {};

    if (lvl === 1) {
      const activeText = cd.activeLevels?.[String(stg.activeLevel || 2)]?.text || cd.activeLevels?.['2']?.text || '';
      return { badge: 'Active Skill', badgeType: 'active', text: activeText || 'Active Skill Level UP' };
    }
    if (lvl === 2) {
      const pct = Math.round(((stg.statBonus || 0.1) - (prev.statBonus || 0)) * 100);
      const displayPct = pct > 0 ? pct : (stg.statBonus ? Math.round(stg.statBonus * 100) : 10);
      return { badge: 'Parameter UP', badgeType: 'param', text: `All Parameters ${displayPct}% UP` };
    }
    if (lvl === 3) {
      const specialText = cd.specialLevels?.[String(stg.specialLevel || 2)]?.text || cd.specialLevels?.['2']?.text || '';
      return { badge: 'Special Skill', badgeType: 'special', text: specialText || 'Special Skill Level UP' };
    }
    if (lvl === 4) {
      const passiveText = cd.passiveLevels?.[String(stg.passiveLevel || 2)]?.text || cd.passiveLevels?.['2']?.text || '';
      return { badge: 'Passive Skill', badgeType: 'passive', text: passiveText || 'Passive Skill Level UP' };
    }
    if (lvl === 5) {
      if (stg.connectLevel || cd.rarity === 5 || cd.rarityNum === 5) {
        return {
          badge: 'Connect Bonus',
          badgeType: 'connect',
          subLabel: cd.nodesCount ? `Grants ${cd.nodesCount} Nodes` : null,
          text: cd.connectText || 'Grants Holomem Board Effect UP 135% for all within range.',
        };
      }
      const pct = Math.round(((stg.statBonus || 0.1) - (prev.statBonus || 0)) * 100);
      return { badge: 'Parameter UP', badgeType: 'param', text: `All Parameters ${pct > 0 ? pct : 10}% UP` };
    }
    return { badge: 'Parameter UP', badgeType: 'param', text: 'All Parameters 10% UP' };
  };

  const activeBloomDisplay = getBloomCardDisplay(activeBloom);

  // Base skill mechanics (ALWAYS AT BASE LEVEL)
  const baseOutfitText = cd?.outfit?.text || activeCharacter?.skills?.outfit || '';
  const baseSpecialText = cd?.specialLevels?.['1']?.text || activeCharacter?.skills?.special || '';
  const baseActiveText = cd?.activeLevels?.['1']?.text || activeCharacter?.skills?.active || '';
  const basePassiveText = cd?.passiveLevels?.['1']?.text || activeCharacter?.skills?.passive || '';

  // Level/bloom stat explorer
  const maxLevel = cd?.levelBaseValues?.length || cd?.maxLevel || 80;
  const level = Math.min(statLevel ?? maxLevel, maxLevel);
  const explored = activeCharacter ? statsAt(cd, statBloom, level) : null;
  const mainStat = activeCharacter ? mainStatOf(activeCharacter) : null;

  const formatSkillText = (text) => {
    if (!text) return '';
    const regex = /(\d+%(?:\.\d+%)?|\d+s|\b\d{3,}\b|\b\d+\s+Nodes\b)/g;
    const parts = text.split(regex);
    return parts.map((part, i) => {
      if (/^(\d+%(?:\.\d+%)?|\d+s|\d{3,}|\d+\s+Nodes)$/.test(part)) {
        return <span key={i} className="skill-highlight-num">{part}</span>;
      }
      return part;
    });
  };

  const renderBadges = (char) => (
    <div className="char-card-badges">
      {charGroupLabels(char).map((g) => (
        <span key={g} className="badge-role">
          <Users size={10} className="mr-1" />
          {g}
        </span>
      ))}
      <span className="badge-elem">
        {getTypeIcon(char.type)}
        {TYPE_DISPLAY[char.type] || char.type}
      </span>
    </div>
  );

  const rarityStars = (char) => `${char.rarityNum || parseInt(char.rarity, 10) || '?'}★`;

  return (
    <div className="character-db-page animate-fade-in">
      <div className="db-header">
        <h1 className="page-title">{t('database_title')}</h1>
        <p className="page-subtitle">{t('database_desc')}</p>
      </div>

      {/* Search, filters, sort and view controls */}
      <div className="filter-bar glass">
        <div className="db-toolbar">
          <input
            type="search"
            placeholder={t('search_placeholder')}
            aria-label={t('search_placeholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="db-search-input glass"
          />
          <button
            type="button"
            className={`toolbar-btn${filtersOpen ? ' active' : ''}`}
            aria-expanded={filtersOpen}
            aria-controls="db-filter-panel"
            onClick={() => setFiltersOpen((o) => !o)}
          >
            <SlidersHorizontal size={16} />
            <span>{t('filters')}</span>
            {activeFilterCount > 0 && <span className="toolbar-count">{activeFilterCount}</span>}
          </button>
        </div>

        <div className="db-toolbar db-toolbar-secondary">
          <label className="sort-control">
            <span className="sr-only">{t('sort_by')}</span>
            <select
              value={sortKey}
              onChange={(e) => { setSortKey(e.target.value); setSortDesc(e.target.value !== 'name'); }}
              aria-label={t('sort_by')}
            >
              {SORT_OPTIONS.map((key) => (
                <option key={key} value={key}>{t('sort_by')}: {t(`sort_${key}`)}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="toolbar-btn icon-only"
            aria-label={sortDesc ? t('sort_desc') : t('sort_asc')}
            title={sortDesc ? t('sort_desc') : t('sort_asc')}
            onClick={() => setSortDesc((d) => !d)}
          >
            {sortDesc ? <ArrowDownWideNarrow size={16} /> : <ArrowUpNarrowWide size={16} />}
          </button>
          <div className="view-toggle" role="group" aria-label="View">
            <button
              type="button"
              className={`toolbar-btn icon-only${view === 'grid' ? ' active' : ''}`}
              aria-label={t('view_grid')}
              aria-pressed={view === 'grid'}
              title={t('view_grid')}
              onClick={() => changeView('grid')}
            >
              <LayoutGrid size={16} />
            </button>
            <button
              type="button"
              className={`toolbar-btn icon-only${view === 'list' ? ' active' : ''}`}
              aria-label={t('view_list')}
              aria-pressed={view === 'list'}
              title={t('view_list')}
              onClick={() => changeView('list')}
            >
              <List size={16} />
            </button>
          </div>
        </div>

        {filtersOpen && (
          <div id="db-filter-panel" className="filter-panel">
            <div className="filter-group">
              <span className="filter-label">{t('rarity')}</span>
              <div className="filter-options">
                {rarities.map((r) => (
                  <button
                    key={r}
                    className={`filter-btn ${selectedRarity === r ? 'active' : ''}`}
                    onClick={() => setSelectedRarity(r)}
                  >
                    {r === 'All' ? t('all') : r}
                  </button>
                ))}
              </div>
            </div>

            <div className="filter-group">
              <span className="filter-label">{t('group')}</span>
              <div className="filter-options">
                {groups.map((group) => (
                  <button
                    key={group}
                    className={`filter-btn ${selectedGroup === group ? 'active' : ''}`}
                    onClick={() => setSelectedGroup(group)}
                  >
                    {group === 'All' ? t('all') : group}
                  </button>
                ))}
              </div>
            </div>

            <div className="filter-group">
              <span className="filter-label">{t('type')}</span>
              <div className="filter-options">
                {types.map((type) => (
                  <button
                    key={type}
                    className={`filter-btn ${selectedType === type ? 'active' : ''}`}
                    onClick={() => setSelectedType(type)}
                  >
                    {type === 'All' ? t('all') : (TYPE_DISPLAY[type] || type)}
                  </button>
                ))}
              </div>
            </div>

            <div className="filter-group">
              <span className="filter-label">{t('main_stat')}</span>
              <div className="filter-options">
                {statFilters.map((s) => (
                  <button
                    key={s}
                    className={`filter-btn ${selectedStat === s ? 'active' : ''}`}
                    onClick={() => setSelectedStat(s)}
                  >
                    {s === 'All' ? t('all') : t(STAT_LABEL_KEYS[s])}
                  </button>
                ))}
              </div>
            </div>

            <div className="filter-group">
              <span className="filter-label">{t('roster')}</span>
              <div className="filter-options">
                <button
                  className={`filter-btn ${rosterOnly ? 'active' : ''}`}
                  aria-pressed={rosterOnly}
                  onClick={() => setRosterOnly((v) => !v)}
                >
                  {t('in_my_roster')}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="results-row">
          <span className="results-count" aria-live="polite">
            {t('results_count', { shown: filteredCharacters.length, total: displayList.length })}
          </span>
          {(activeFilterCount > 0 || searchQuery) && (
            <button type="button" className="clear-filters-btn" onClick={clearFilters}>
              {t('clear_filters')}
            </button>
          )}
        </div>
      </div>

      {filteredCharacters.length === 0 && (
        <div className="db-empty glass">
          <p>{t('no_results')}</p>
          <button type="button" className="clear-filters-btn" onClick={clearFilters}>{t('clear_filters')}</button>
        </div>
      )}

      {/* Card grid / list */}
      {view === 'grid' ? (
        <div className="character-grid">
          {filteredCharacters.map((char) => (
            <div
              key={char.assetId || char.id}
              className="char-card glass"
              style={{ '--hover-color': getTypeColor(char.type) }}
              role="button"
              tabIndex={0}
              onClick={() => openCard(char)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCard(char); } }}
            >
              <div className="rarity-badge">{char.rarity}</div>
              <div className="char-card-body">
                <div className="char-card-media-wrapper">
                  <CardArt name={char.name} src={char.image} fallbackSrc={char.fallbackImage} className="char-card-img" small />
                </div>
                <h3 className="char-card-name">{char.name}</h3>
                <p className="char-card-title">{char.title}</p>
                {renderBadges(char)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="character-list" role="list">
          {filteredCharacters.map((char) => {
            const main = mainStatOf(char);
            return (
              <div
                key={char.assetId || char.id}
                role="listitem"
                tabIndex={0}
                className="char-row glass"
                style={{ '--hover-color': getTypeColor(char.type) }}
                onClick={() => openCard(char)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCard(char); } }}
              >
                <div className="char-row-thumb">
                  <CardArt name={char.name} src={char.image} fallbackSrc={char.fallbackImage} className="char-row-img" small />
                </div>
                <div className="char-row-main">
                  <span className="char-row-name">{char.name}</span>
                  <span className="char-row-title">{char.title}</span>
                </div>
                <span className="char-row-rarity">{rarityStars(char)}</span>
                <span className="badge-elem">
                  {getTypeIcon(char.type)}
                  {TYPE_DISPLAY[char.type] || char.type}
                </span>
                <div className="char-row-stats">
                  {STAT_KEYS.map((k) => (
                    <span key={k} className={main === k ? 'is-main' : ''} title={t(STAT_LABEL_KEYS[k])}>
                      {fmt(char.stats?.[k])}
                    </span>
                  ))}
                  <strong title={t('stat_total')}>{fmt(char.stats?.total)}</strong>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail Modal Overlay */}
      {activeCharacter && (
        <div className="modal-overlay card-modal-overlay" onClick={closeCard}>
          <div
            className="card-detail-modal glass animate-scale-up"
            role="dialog"
            aria-modal="true"
            aria-label={`${activeCharacter.name} — ${activeCharacter.title}`}
            onClick={(e) => e.stopPropagation()}
          >
            <button className="modal-close" onClick={closeCard} aria-label={t('close')}>
              <X size={20} />
            </button>

            <div className="modal-two-col-layout">
              {/* Left Column: Card Artwork & Metadata */}
              <div className="modal-card-col">
                <div className="modal-card-frame" style={{ borderColor: getTypeColor(activeCharacter.type), boxShadow: `0 0 25px ${getTypeColor(activeCharacter.type)}35` }}>
                  <div className="card-rarity-pill">{activeCharacter.rarity}</div>
                  <CardArt
                    name={activeCharacter.name}
                    src={activeCharacter.image}
                    fallbackSrc={activeCharacter.fallbackImage}
                    className="modal-card-portrait"
                  />
                </div>

                <div className="modal-stat-box glass">
                  <h4 className="stat-box-title">Card Specs</h4>
                  <div className="stat-box-row">
                    <span>Max Level</span>
                    <strong>Lv. {cd?.maxLevel || (activeCharacter.rarityNum === 5 ? 80 : (activeCharacter.rarityNum === 4 ? 70 : 60))}</strong>
                  </div>
                  <div className="stat-box-row">
                    <span>Attribute</span>
                    <strong style={{ color: getTypeColor(activeCharacter.type) }}>{activeCharacter.type}</strong>
                  </div>
                  <div className="stat-box-row">
                    <span>Generation(s)</span>
                    <strong>{charGroupLabels(activeCharacter).join(', ')}</strong>
                  </div>
                </div>
              </div>

              {/* Right Column: Title, Stats, Bloom Stepper, Official Bloom Card, Base Skill Mechanics */}
              <div className="modal-info-col">
                <div className="modal-info-header">
                  <span className="modal-member-name">{activeCharacter.name}</span>
                  <h2 className="modal-card-title">{activeCharacter.title}</h2>

                  <div className="modal-badge-group">
                    {charGroupLabels(activeCharacter).map((g) => (
                      <span key={g} className="modal-badge group-badge">
                        <Users size={12} className="mr-1" />
                        {g}
                      </span>
                    ))}
                    <span className="modal-badge type-badge" style={{ color: getTypeColor(activeCharacter.type), borderColor: `${getTypeColor(activeCharacter.type)}50` }}>
                      {getTypeIcon(activeCharacter.type)}
                      <span className="ml-1">{TYPE_DISPLAY[activeCharacter.type] || activeCharacter.type}</span>
                    </span>
                    <span className="modal-badge rarity-badge-inline">
                      <Sparkles size={12} className="mr-1" />
                      {activeCharacter.rarity}
                    </span>
                    <button type="button" className="modal-badge copy-link-btn" onClick={copyLink}>
                      {linkCopied ? <Check size={12} className="mr-1" /> : <LinkIcon size={12} className="mr-1" />}
                      {linkCopied ? t('link_copied') : t('copy_link')}
                    </button>
                  </div>
                </div>

                {/* Stats at a chosen level and bloom stage */}
                {explored && (
                  <div className="stat-explorer glass">
                    <div className="stat-explorer-head">
                      <h4 className="skills-section-heading">{t('stats_heading')}</h4>
                      <div className="stat-explorer-bloom" role="group" aria-label={t('bloom_label')}>
                        <span>{t('bloom_label')}</span>
                        {[0, 1, 2, 3, 4, 5].map((b) => (
                          <button
                            key={b}
                            type="button"
                            className={statBloom === b ? 'active' : ''}
                            aria-pressed={statBloom === b}
                            onClick={() => setStatBloom(b)}
                          >
                            {b}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="stat-explorer-level">
                      <label htmlFor="stat-level">{t('level_label')}</label>
                      <input
                        id="stat-level"
                        type="range"
                        min={1}
                        max={maxLevel}
                        value={level}
                        onChange={(e) => setStatLevel(Number(e.target.value))}
                      />
                      <output htmlFor="stat-level">Lv. {level}</output>
                    </div>
                    <div className="stat-explorer-grid">
                      {STAT_KEYS.map((k) => (
                        <div key={k} className={`stat-tile${mainStat === k ? ' main' : ''}`}>
                          <span>{t(STAT_LABEL_KEYS[k])}{mainStat === k ? ` · ${t('main_tag')}` : ''}</span>
                          <strong>{fmt(explored[k])}</strong>
                        </div>
                      ))}
                      <div className="stat-tile total">
                        <span>{t('stat_total')}</span>
                        <strong>{fmt(explored.total)}</strong>
                      </div>
                    </div>
                  </div>
                )}

                {/* Bloom Stepper Row & Official In-Game Card Display */}
                <div className="bloom-stepper-wrapper">
                  <div className="bloom-stepper-bar">
                    {[1, 2, 3, 4, 5].map((lvl, idx) => {
                      const isSelected = activeBloom === lvl;
                      const isReached = activeBloom >= lvl;
                      return (
                        <React.Fragment key={lvl}>
                          <button
                            className={`bloom-step-node ${isSelected ? 'active' : ''} ${isReached ? 'reached' : ''}`}
                            onClick={() => setActiveBloom(lvl)}
                            title={`Bloom ${lvl}`}
                          >
                            <span>{lvl}</span>
                          </button>
                          {idx < 4 && <div className={`bloom-step-line ${activeBloom > lvl ? 'active' : ''}`} />}
                        </React.Fragment>
                      );
                    })}
                  </div>

                  {/* Official Holodori In-Game Bloom Card Display */}
                  <div className="bloom-card-banner glass">
                    <div className="bloom-card-header">
                      <span className={`bloom-pill-badge ${activeBloomDisplay.badgeType}-pill`}>
                        {activeBloomDisplay.badge}
                      </span>
                      {activeBloomDisplay.subLabel && (
                        <span className="bloom-sub-pill">{activeBloomDisplay.subLabel}</span>
                      )}
                    </div>
                    <p className="bloom-card-text">{formatSkillText(activeBloomDisplay.text)}</p>
                  </div>
                </div>

                {/* Base Skill Mechanics Cards (EXACT ORDER: 1. Outfit, 2. Special, 3. Active, 4. Passive) */}
                <div className="modal-skills-list-container">
                  <h4 className="skills-section-heading">Base Skill Mechanics</h4>

                  {baseOutfitText && (
                    <div className="skill-card outfit-skill glass">
                      <div className="skill-card-head">
                        <span className="skill-tag outfit-tag">
                          <Award size={13} className="mr-1" /> Outfit Skill
                        </span>
                      </div>
                      <p className="skill-card-text">{formatSkillText(baseOutfitText)}</p>
                    </div>
                  )}

                  {baseSpecialText && (
                    <div className="skill-card special-skill glass">
                      <div className="skill-card-head">
                        <span className="skill-tag special-tag">
                          <Sparkles size={13} className="mr-1" /> Special Skill
                        </span>
                      </div>
                      <p className="skill-card-text">{formatSkillText(baseSpecialText)}</p>
                    </div>
                  )}

                  {baseActiveText && (
                    <div className="skill-card active-skill glass">
                      <div className="skill-card-head">
                        <span className="skill-tag active-tag">
                          <Zap size={13} className="mr-1" /> Active Skill
                        </span>
                      </div>
                      <p className="skill-card-text">{formatSkillText(baseActiveText)}</p>
                    </div>
                  )}

                  {basePassiveText && (
                    <div className="skill-card passive-skill glass">
                      <div className="skill-card-head">
                        <span className="skill-tag passive-tag">
                          <Shield size={13} className="mr-1" /> Passive Skill
                        </span>
                      </div>
                      <p className="skill-card-text">{formatSkillText(basePassiveText)}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
