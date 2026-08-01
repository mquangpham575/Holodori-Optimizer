import { useLanguage } from '../context/LanguageContext';
import React, { useState } from 'react';
import { X, Heart, Leaf, Sun, Paintbrush, Users } from 'lucide-react';
import './CharacterDB.css';

export default function CharacterDB({ onAccentChange, currentAccent, characters = [] }) {
  const { t } = useLanguage();
  const [selectedGroup, setSelectedGroup] = useState('All');
  const [selectedType, setSelectedType] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCharacter, setActiveCharacter] = useState(null);

  const groups = ['All', ...Array.from(new Set(characters.map((c) => c.group).filter(Boolean)))];
  const types = ['All', 'PURE', 'CUTE', 'HAPPY'];

  const typeDisplayMap = {
    'PURE': 'Pure Type',
    'CUTE': 'Cute Type',
    'HAPPY': 'Happy Type'
  };

  const filteredCharacters = characters.filter((char) => {
    const matchesGroup = selectedGroup === 'All' || char.group === selectedGroup;
    const matchesType = selectedType === 'All' || char.type === selectedType;
    const matchesSearch = char.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesGroup && matchesType && matchesSearch;
  });

  const getTypeIcon = (type) => {
    switch (type) {
      case 'PURE': return <Leaf className="elem-icon text-pure" size={14} />;
      case 'CUTE': return <Heart className="elem-icon text-cute" size={14} />;
      case 'HAPPY': return <Sun className="elem-icon text-happy" size={14} />;
      default: return null;
    }
  };

  const skillTypes = [
    { key: 'outfit', label: 'Outfit Skill' },
    { key: 'special', label: 'Special Skill' },
    { key: 'active', label: 'Active Skill' },
    { key: 'passive', label: 'Passive Skill' }
  ];

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
            style={{ '--hover-color': char.accentColor }}
            onClick={() => setActiveCharacter(char)}
          >
            <div className="rarity-badge">{char.rarity}</div>
            <div className="char-card-body">
              <div className="char-card-media-wrapper">
                {char.image ? (
                  <img src={char.image} alt={char.name} className="char-card-img" />
                ) : (
                  <div className="char-card-avatar-fallback">{char.avatar}</div>
                )}
              </div>
              <h3 className="char-card-name">{char.name}</h3>
              <p className="char-card-title">{char.title}</p>
              
              <div className="char-card-badges">
                <span className="badge-role">
                  <Users size={10} className="mr-1" />
                  {char.group}
                </span>
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
        <div className="modal-overlay" onClick={() => setActiveCharacter(null)}>
          <div className="modal-content glass" onClick={(e) => e.stopPropagation()} style={{ '--char-accent': activeCharacter.accentColor }}>
            <button className="modal-close" onClick={() => setActiveCharacter(null)}>
              <X size={20} />
            </button>

            <div className="modal-body-layout">
              {/* Left Column: Avatar & General info */}
              <div className="modal-left">
                <div className="modal-img-wrapper" style={{ boxShadow: `0 0 30px ${activeCharacter.accentColor}40`, border: `2px solid ${activeCharacter.accentColor}` }}>
                  {activeCharacter.image ? (
                    <img src={activeCharacter.image} alt={activeCharacter.name} className="modal-char-img" />
                  ) : (
                    <span className="modal-avatar">{activeCharacter.avatar}</span>
                  )}
                </div>
                <h2 className="modal-name">{activeCharacter.name}</h2>
                <p className="modal-title-text" style={{ color: activeCharacter.accentColor }}>{activeCharacter.title}</p>
                <div className="char-card-badges justify-center mt-2">
                  <span className="badge-role">
                    <Users size={11} className="mr-1" />
                    {activeCharacter.group}
                  </span>
                  <span className="badge-elem">
                    {getTypeIcon(activeCharacter.type)}
                    {typeDisplayMap[activeCharacter.type] || activeCharacter.type}
                  </span>
                </div>
                
                <button 
                  className="btn-sync-theme"
                  onClick={() => onAccentChange(activeCharacter.accentColor)}
                  style={{ 
                    borderColor: activeCharacter.accentColor, 
                    color: activeCharacter.accentColor,
                    boxShadow: currentAccent === activeCharacter.accentColor ? `0 0 12px ${activeCharacter.accentColor}` : 'none',
                    background: currentAccent === activeCharacter.accentColor ? `${activeCharacter.accentColor}1a` : 'transparent'
                  }}
                >
                  <Paintbrush size={14} /> Sync Site Theme
                </button>
              </div>

              {/* Right Column: Skills */}
              <div className="modal-right">
                <div className="modal-section-block">
                  <h3 className="section-subtitle">{t('skills_label')}</h3>
                  <div className="skills-container">
                    {skillTypes.map((skill) => (
                      <div key={skill.key} className="skill-item glass">
                        <div className="skill-header">
                          <span className="skill-name">{skill.label}</span>
                          <span className="skill-type" style={{ color: activeCharacter.accentColor, background: `${activeCharacter.accentColor}15` }}>ACTIVE</span>
                        </div>
                        <p className="skill-desc">{activeCharacter.skills[skill.key]}</p>
                      </div>
                    ))}
                  </div>
                </div>


              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
