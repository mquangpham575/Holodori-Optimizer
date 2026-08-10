import { useLanguage } from '../context/LanguageContext';
import React, { useState } from 'react';
import { X, Heart, Leaf, Sun, Paintbrush, Users, Sparkles, Award, Zap, Shield, Grid } from 'lucide-react';
import { ALL_CARDS } from '../data';
import './CharacterDB.css';

export default function CharacterDB({ onAccentChange, currentAccent, characters = [], allCards = [] }) {
  const { t } = useLanguage();
  const [selectedGroup, setSelectedGroup] = useState('All');
  const [selectedType, setSelectedType] = useState('All');
  const [selectedRarity, setSelectedRarity] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCharacter, setActiveCharacter] = useState(null);
  const [activeBloom, setActiveBloom] = useState(1);

  const displayList = allCards.length > 0
    ? allCards
    : (ALL_CARDS && ALL_CARDS.length > 0) ? ALL_CARDS : characters;

  const getInitials = (name) => {
    const parts = (name || '').trim().split(/\s+/).filter(Boolean);
    return parts.slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  };

  const CardArt = ({ name, src, alt, className, small }) => {
    const [failed, setFailed] = useState(false);
    if (!src || failed) {
      return (
        <div className={`card-art-initials${small ? ' small' : ''}`}>{getInitials(name)}</div>
      );
    }
    return <img src={src} alt={alt || name} className={className} onError={() => setFailed(true)} />;
  };

  const GROUP_ORDER = [
    'Gen 0', 'Gen 1', 'Gen 2', 'GAMERS', 'Gen 3', 'Gen 4', 'Gen 5', 'holoX',
    'ID Gen 1', 'ID Gen 2', 'ID Gen 3', 'Myth', 'Promise', 'Advent', 'ReGLOSS'
  ];

  const charGroupLabels = (char) => {
    const labels = new Set();
    if (char.group) labels.add(char.group);
    if (char.cardData?.groupLabels) char.cardData.groupLabels.forEach((l) => l && labels.add(l));
    if (char.groupLabels) (Array.isArray(char.groupLabels) ? char.groupLabels : [char.groupLabels]).forEach((l) => l && labels.add(l));
    return Array.from(labels).sort((a, b) => {
      const idxA = GROUP_ORDER.indexOf(a);
      const idxB = GROUP_ORDER.indexOf(b);
      return (idxA !== -1 ? idxA : 99) - (idxB !== -1 ? idxB : 99);
    });
  };

  const presentGroups = Array.from(new Set(displayList.flatMap((c) => charGroupLabels(c)))).filter(Boolean);
  presentGroups.sort((a, b) => {
    const idxA = GROUP_ORDER.indexOf(a);
    const idxB = GROUP_ORDER.indexOf(b);
    return (idxA !== -1 ? idxA : 99) - (idxB !== -1 ? idxB : 99);
  });

  const groups = ['All', ...presentGroups];
  const types = ['All', 'PURE', 'CUTE', 'HAPPY'];
  const rarities = ['All', '5-Star', '4-Star', '3-Star'];

  const typeDisplayMap = {
    'PURE': 'Pure Type',
    'CUTE': 'Cute Type',
    'HAPPY': 'Happy Type'
  };

  const filteredCharacters = displayList.filter((char) => {
    const matchesGroup = selectedGroup === 'All' || charGroupLabels(char).includes(selectedGroup);
    const matchesType = selectedType === 'All' || char.type === selectedType;
    const matchesRarity = selectedRarity === 'All' || char.rarity === selectedRarity || (char.rarityNum && char.rarityNum === parseInt(selectedRarity));
    const matchesSearch = char.name.toLowerCase().includes(searchQuery.toLowerCase()) || (char.title && char.title.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesGroup && matchesType && matchesRarity && matchesSearch;
  });

  const getTypeIcon = (type) => {
    switch (type) {
      case 'PURE': return <Leaf className="elem-icon text-pure" size={14} />;
      case 'CUTE': return <Heart className="elem-icon text-cute" size={14} />;
      case 'HAPPY': return <Sun className="elem-icon text-happy" size={14} />;
      default: return null;
    }
  };

  const getTypeColor = (type) => {
    switch (type) {
      case 'PURE': return '#4caf50';
      case 'CUTE': return '#ff4d6d';
      case 'HAPPY': return '#ff9f1c';
      default: return '#4caf50';
    }
  };

  const handleOpenCard = (char) => {
    setActiveCharacter(char);
    setActiveBloom(1);
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
      return {
        badge: 'Active Skill',
        badgeType: 'active',
        text: activeText || 'Active Skill Level UP'
      };
    }
    if (lvl === 2) {
      const pct = Math.round(((stg.statBonus || 0.1) - (prev.statBonus || 0)) * 100);
      const displayPct = pct > 0 ? pct : (stg.statBonus ? Math.round(stg.statBonus * 100) : 10);
      return {
        badge: 'Parameter UP',
        badgeType: 'param',
        text: `All Parameters ${displayPct}% UP`
      };
    }
    if (lvl === 3) {
      const specialText = cd.specialLevels?.[String(stg.specialLevel || 2)]?.text || cd.specialLevels?.['2']?.text || '';
      return {
        badge: 'Special Skill',
        badgeType: 'special',
        text: specialText || 'Special Skill Level UP'
      };
    }
    if (lvl === 4) {
      const passiveText = cd.passiveLevels?.[String(stg.passiveLevel || 2)]?.text || cd.passiveLevels?.['2']?.text || '';
      return {
        badge: 'Passive Skill',
        badgeType: 'passive',
        text: passiveText || 'Passive Skill Level UP'
      };
    }
    if (lvl === 5) {
      if (stg.connectLevel || cd.rarity === 5 || cd.rarityNum === 5) {
        return {
          badge: 'Connect Bonus',
          badgeType: 'connect',
          subLabel: cd.nodesCount ? `Grants ${cd.nodesCount} Nodes` : null,
          text: cd.connectText || 'Grants Holomem Board Effect UP 135% for all within range.'
        };
      }
      const pct = Math.round(((stg.statBonus || 0.1) - (prev.statBonus || 0)) * 100);
      return {
        badge: 'Parameter UP',
        badgeType: 'param',
        text: `All Parameters ${pct > 0 ? pct : 10}% UP`
      };
    }

    return { badge: 'Parameter UP', badgeType: 'param', text: 'All Parameters 10% UP' };
  };

  const activeBloomDisplay = getBloomCardDisplay(activeBloom);

  // Base skill mechanics (ALWAYS AT BASE LEVEL)
  const baseOutfitText = cd?.outfit?.text || activeCharacter?.skills?.outfit || '';
  const baseSpecialText = cd?.specialLevels?.['1']?.text || activeCharacter?.skills?.special || '';
  const baseActiveText = cd?.activeLevels?.['1']?.text || activeCharacter?.skills?.active || '';
  const basePassiveText = cd?.passiveLevels?.['1']?.text || activeCharacter?.skills?.passive || '';

  const formatSkillText = (text) => {
    if (!text) return '';
    const regex = /(\d+%(?:\.\d+%)?|\d+s|\b\d{3,}\b|\b\d+\s+Nodes\b)/g;
    const parts = text.split(regex);
    return parts.map((part, i) => {
      if (/^(\d+%(?:\.\d+%)?|\d+s|\d{3,}|\d+\s+Nodes)$/.test(part)) {
        return (
          <span key={i} className="skill-highlight-num">
            {part}
          </span>
        );
      }
      return part;
    });
  };

  return (
    <div className="character-db-page animate-fade-in">
      <div className="db-header">
        <h1 className="page-title">{t('database_title')}</h1>
        <p className="page-subtitle">{t('database_desc')}</p>
      </div>

      {/* Filter bar */}
      <div className="filter-bar glass">
        <div className="search-group">
          <input
            type="text"
            placeholder={t('search_placeholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="db-search-input glass"
          />
        </div>

        <div className="filter-group">
          <span className="filter-label">Rarity</span>
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
                key={group === 'All' ? t('all') : group}
                className={`filter-btn ${selectedGroup === group ? 'active' : ''}`}
                onClick={() => setSelectedGroup(group)}
              >
                {group}
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
                {type === 'All' ? t('all') : (typeDisplayMap[type] || type)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Character Grid */}
      <div className="character-grid">
        {filteredCharacters.map((char) => (
          <div
            key={char.id}
            className="char-card glass"
            style={{ '--hover-color': getTypeColor(char.type) }}
            onClick={() => handleOpenCard(char)}
          >
            <div className="rarity-badge">{char.rarity}</div>
            <div className="char-card-body">
              <div className="char-card-media-wrapper">
                <CardArt name={char.name} src={char.image} className="char-card-img" small />
              </div>
              <h3 className="char-card-name">{char.name}</h3>
              <p className="char-card-title">{char.title}</p>
              
              <div className="char-card-badges">
                {charGroupLabels(char).map((g) => (
                  <span key={g} className="badge-role">
                    <Users size={10} className="mr-1" />
                    {g}
                  </span>
                ))}
                <span className="badge-elem">
                  {getTypeIcon(char.type)}
                  {typeDisplayMap[char.type] || char.type}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Detail Modal Overlay */}
      {activeCharacter && (
        <div className="modal-overlay card-modal-overlay" onClick={() => setActiveCharacter(null)}>
          <div className="card-detail-modal glass animate-scale-up" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setActiveCharacter(null)}>
              <X size={20} />
            </button>

            <div className="modal-two-col-layout">
              {/* Left Column: Card Artwork & Metadata */}
              <div className="modal-card-col">
                <div className="modal-card-frame" style={{ borderColor: getTypeColor(activeCharacter.type), boxShadow: `0 0 25px ${getTypeColor(activeCharacter.type)}35` }}>
                  <div className="card-rarity-pill">{activeCharacter.rarity}</div>
                  <CardArt name={activeCharacter.name} src={activeCharacter.image} className="modal-card-portrait" />
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

              {/* Right Column: Title, Bloom Stepper, Official Bloom Card, Base Skill Mechanics */}
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
                      <span className="ml-1">{typeDisplayMap[activeCharacter.type] || activeCharacter.type}</span>
                    </span>
                    <span className="modal-badge rarity-badge-inline">
                      <Sparkles size={12} className="mr-1" />
                      {activeCharacter.rarity}
                    </span>
                  </div>
                </div>

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

                  {/* 1. Outfit Skill */}
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

                  {/* 2. Special Skill */}
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

                  {/* 3. Active Skill */}
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

                  {/* 4. Passive Skill */}
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
