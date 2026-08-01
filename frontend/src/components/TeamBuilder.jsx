import { useLanguage } from '../context/LanguageContext';
import React, { useState } from 'react';
import { Trash2, Users, AlertCircle, CheckCircle2, Award, Leaf, Heart, Sun, Sparkles, X, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import './TeamBuilder.css';
import './CharacterDB.css';
const GROUPS = [
  "Gen 0", "Gen 1", "Gen 2", "GAMERS", "Gen 3", "Gen 4", "Gen 5", "holoX",
  "ID Gen 1", "ID Gen 2", "ID Gen 3", "Myth", "Promise", "Advent", "ReGLOSS"
];
const getPassiveCount = (team, leader, characters) => {
  const uniqueActiveIds = Array.from(new Set([...team, leader].filter(Boolean)));
  let activeCount = 0;
  
  // 1. Evaluate normal passive skills
  uniqueActiveIds.forEach(id => {
    const char = characters.find(c => c.id === id);
    if (char && char.skills && char.skills.passive) {
      const passiveText = char.skills.passive;
        const match = passiveText.match(/(?:with\s+(\d+)\s+or\s+more|to\s+(\d+))\s+([A-Za-z0-9\s\-++]+)\s+Members/i);
      if (!match) {
        activeCount++;
      } else {
        const requiredCount = parseInt(match[1] || match[2]) || 2;
        const rawTarget = match[3].trim().toUpperCase();
        const condTarget = rawTarget
          .replace(/[[\]]/g, '')
          .replace(/\bTYPE\b/g, '')
          
          .trim();
        
        let count = 0;
        uniqueActiveIds.forEach(activeId => {
          const activeChar = characters.find(c => c.id === activeId);
          if (activeChar) {
            if (activeChar.group.toUpperCase() === condTarget || 
                activeChar.type.toUpperCase() === condTarget) {
              count++;
            }
          }
        });
        if (count >= requiredCount) {
          activeCount++;
        }
      }
    }
  });
  // 2. Evaluate Leader Passive (Outfit Skill)
  if (leader) {
    const leaderChar = characters.find(c => c.id === leader);
    if (leaderChar && leaderChar.skills && leaderChar.skills.outfit) {
      const outfitText = leaderChar.skills.outfit;
        const match = outfitText.match(/(?:with\s+(\d+)\s+or\s+more|to\s+(\d+))\s+([A-Za-z0-9\s\-++]+)\s+Members/i);
      if (!match) {
        activeCount++;
      } else {
        const requiredCount = parseInt(match[1] || match[2]) || 2;
        const rawTarget = match[3].trim().toUpperCase();
        const condTarget = rawTarget
          .replace(/[[\]]/g, '')
          .replace(/\bTYPE\b/g, '')
          
          .trim();
        
        let count = 0;
        uniqueActiveIds.forEach(activeId => {
          const activeChar = characters.find(c => c.id === activeId);
          if (activeChar) {
            if (activeChar.group.toUpperCase() === condTarget || 
                activeChar.type.toUpperCase() === condTarget) {
              count++;
            }
          }
        });
        if (count >= requiredCount) {
          activeCount++;
        }
      }
    }
  }
  return activeCount;
};
const recommendBestTeam = (ownedIds, characters) => {
  if (ownedIds.length < 5) return null;
  
  const charScores = ownedIds.map(id => {
    const char = characters.find(c => c.id === id);
    if (!char) return { id, score: 0 };
    
    const sameGenCount = ownedIds.filter(oid => {
      const ochar = characters.find(c => c.id === oid);
      return ochar && ochar.id !== id && ochar.group === char.group;
    }).length;
    
    const sameTypeCount = ownedIds.filter(oid => {
      const ochar = characters.find(c => c.id === oid);
      return ochar && ochar.id !== id && ochar.type === char.type;
    }).length;
    
    const score = (sameGenCount * 3) + sameTypeCount;
    return { id, score };
  });
  
  charScores.sort((a, b) => b.score - a.score);
  const candidates = charScores.slice(0, 13).map(c => c.id);
  
  const getCombinations = (arr, k) => {
    const result = [];
    const helper = (start, combo) => {
      if (combo.length === k) {
        result.push([...combo]);
        return;
      }
      for (let i = start; i < arr.length; i++) {
        combo.push(arr[i]);
        helper(i + 1, combo);
        combo.pop();
      }
    };
    helper(0, []);
    return result;
  };
  
  const combos = getCombinations(candidates, 5);
  
  let bestTeam = null;
  let bestLeader = null;
  let maxScore = -1;
  
  combos.forEach(team => {
    team.forEach(leader => {
      const score = getPassiveCount(team, leader, characters);
      if (score > maxScore) {
        maxScore = score;
        bestTeam = team;
        bestLeader = leader;
      }
    });
  });
  
  return { team: bestTeam, leader: bestLeader, passiveCount: maxScore };
};
export default function TeamBuilder({ presets, selectedPresetId, setSelectedPresetId, onUpdatePreset, onSavePresets, ownedRoster = [], onUpdateOwnedRoster, characters = [] }) {
  const { t } = useLanguage();
  const [isActiveExpanded, setIsActiveExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSlotIndex, setActiveSlotIndex] = useState(null); // 'leader' or 0, 1, 2, 3, 4 or null
  const [isEditingName, setIsEditingName] = useState(false);
  const [newNameInput, setNewNameInput] = useState('');
  const [isRosterExpanded, setIsRosterExpanded] = useState(false);
  const [showRecommendationModal, setShowRecommendationModal] = useState(false);
  const [isRecSkillsExpanded, setIsRecSkillsExpanded] = useState(false);
  const [recommendedTeamResult, setRecommendedTeamResult] = useState(null);
  const currentPreset = presets.find(p => p.id === selectedPresetId) || presets[0];
  const activeTeam = currentPreset.team;
  const activeLeader = currentPreset.leader;
  const setActiveTeam = (newTeam) => {
    onUpdatePreset(selectedPresetId, { team: newTeam });
  };
  const setActiveLeader = (newLeader) => {
    onUpdatePreset(selectedPresetId, { leader: newLeader });
  };
  const handleStartRename = () => {
    setNewNameInput(currentPreset.name);
    setIsEditingName(true);
  };
  const handleSaveRename = () => {
    if (newNameInput.trim()) {
      onUpdatePreset(selectedPresetId, { name: newNameInput.trim() });
    }
    setIsEditingName(false);
  };
  // Drag and Drop handlers for Team Units and Leader slot
  const handleDragStart = (e, sourceType, index) => {
    e.dataTransfer.setData('sourceType', sourceType);
    if (index !== null) {
      e.dataTransfer.setData('sourceIndex', index.toString());
    }
  };
  const handleDragOver = (e) => {
    e.preventDefault(); // Required to allow drop!
  };
  const handleDropOnTeamSlot = (e, targetIndex) => {
    e.preventDefault();
    const sourceType = e.dataTransfer.getData('sourceType');
    const sourceIndexStr = e.dataTransfer.getData('sourceIndex');
    if (sourceType === 'team') {
      const sourceIndex = parseInt(sourceIndexStr);
      if (sourceIndex === targetIndex) return;
      const newTeam = [...activeTeam];
      const temp = newTeam[targetIndex];
      newTeam[targetIndex] = newTeam[sourceIndex];
      newTeam[sourceIndex] = temp;
      setActiveTeam(newTeam);
    } else if (sourceType === 'leader') {
      if (activeLeader) {
        const newTeam = [...activeTeam];
        const existingIdx = newTeam.indexOf(activeLeader);
        const temp = newTeam[targetIndex];
        
        if (existingIdx !== -1) {
          newTeam[existingIdx] = temp;
        }
        newTeam[targetIndex] = activeLeader;
        setActiveTeam(newTeam);
        
        if (temp) {
          setActiveLeader(temp);
        }
      }
    }
  };
  const handleDropOnLeaderSlot = (e) => {
    e.preventDefault();
    const sourceType = e.dataTransfer.getData('sourceType');
    const sourceIndexStr = e.dataTransfer.getData('sourceIndex');
    if (sourceType === 'team') {
      const sourceIndex = parseInt(sourceIndexStr);
      const charId = activeTeam[sourceIndex];
      if (charId) {
        // Prevent duplicate if character is already leader
        if (activeLeader === charId) return;
        
        // Swap leader with team slot unit if leader was already set
        const oldLeader = activeLeader;
        setActiveLeader(charId);
        
        if (oldLeader) {
          const newTeam = [...activeTeam];
          newTeam[sourceIndex] = oldLeader;
          setActiveTeam(newTeam);
        }
      }
    }
  };
  const handleToggleOwned = (charId) => {
    if (ownedRoster.includes(charId)) {
      onUpdateOwnedRoster(ownedRoster.filter(id => id !== charId));
    } else {
      onUpdateOwnedRoster([...ownedRoster, charId]);
    }
  };
  const handleGenerateRecommendation = () => {
    const result = recommendBestTeam(ownedRoster, characters);
    if (result) {
      setRecommendedTeamResult(result);
      setIsRecSkillsExpanded(false);
      setShowRecommendationModal(true);
    } else {
      alert("Please check at least 5 characters in your owned roster to generate a recommendation!");
    }
  };
  const handleApplyRecommendation = () => {
    if (recommendedTeamResult) {
      onUpdatePreset(selectedPresetId, {
        team: recommendedTeamResult.team,
        leader: recommendedTeamResult.leader
      });
      setShowRecommendationModal(false);
    }
  };
  const typeDisplayMap = {
    'PURE': 'Pure Type',
    'CUTE': 'Cute Type',
    'HAPPY': 'Happy Type'
  };
  const getTypeIcon = (type) => {
    switch (type) {
      case 'PURE': return <Leaf size={11} />;
      case 'CUTE': return <Heart size={11} />;
      case 'HAPPY': return <Sun size={11} />;
      default: return null;
    }
  };
  const getTypeColor = (type) => {
    switch (type) {
      case 'PURE': return '#4caf50'; // Green
      case 'CUTE': return '#ff4d6d'; // Pink
      case 'HAPPY': return '#ff9f1c'; // Yellow/Orange
      default: return 'var(--text-primary)';
    }
  };
  const handleSelectCharacter = (charId) => {
    // Check if character is already in team units
    const existingIdx = activeTeam.indexOf(charId);
    if (activeSlotIndex === 'leader') {
      setActiveLeader(charId);
      setActiveSlotIndex(null);
      return;
    }
    if (activeSlotIndex !== null) {
      // Placing in a specific slot (0 to 4)
      const newTeam = [...activeTeam];
      
      // Prevent duplicates: if character is in another slot, clear that slot
      if (existingIdx !== -1) {
        newTeam[existingIdx] = null;
      }
      
      newTeam[activeSlotIndex] = charId;
      setActiveTeam(newTeam);
      setActiveSlotIndex(null); // Reset focus
    } else {
      // No slot is active
      const isAlreadyInTeam = activeTeam.includes(charId);
      if (isAlreadyInTeam) {
        // Toggle off: remove
        const newTeam = activeTeam.map(id => id === charId ? null : id);
        setActiveTeam(newTeam);
      } else {
        // Find first empty slot
        const emptyIdx = activeTeam.findIndex(id => !id);
        if (emptyIdx !== -1) {
          const newTeam = [...activeTeam];
          newTeam[emptyIdx] = charId;
          setActiveTeam(newTeam);
        } else {
          // Slots are full: do not allow adding more
        }
      }
    }
  };
  const handleClearSlot = (index, e) => {
    e.stopPropagation(); // Prevent activating the slot focus
    const newTeam = [...activeTeam];
    newTeam[index] = null;
    setActiveTeam(newTeam);
  };
  const handleClearLeader = (e) => {
    e.stopPropagation(); // Prevent activating slot focus
    setActiveLeader(null);
  };
  // Find active synergies by checking verbatim character passive skills
  // Evaluate both active and inactive synergies
  const getSynergiesState = () => {
    const active = [];
    const inactive = [];
    const uniqueActiveIds = Array.from(new Set([...activeTeam, activeLeader].filter(Boolean)));
    // 1. Evaluate Leader Passive (Outfit Skill)
    if (activeLeader) {
      const leaderChar = characters.find(c => c.id === activeLeader);
      if (leaderChar && leaderChar.skills && leaderChar.skills.outfit) {
        const outfitText = leaderChar.skills.outfit;
        let isActivated = false;
        
        const match = outfitText.match(/(?:with\s+(\d+)\s+or\s+more|to\s+(\d+))\s+([A-Za-z0-9\s\-++]+)\s+Members/i);
        
        if (!match) {
          isActivated = true;
        } else {
          const requiredCount = parseInt(match[1] || match[2]) || 2;
          const rawTarget = match[3].trim().toUpperCase();
          const condTarget = rawTarget
            .replace(/[[\]]/g, '')
            .replace(/\bTYPE\b/g, '')
            
            .trim();
          
          let count = 0;
          uniqueActiveIds.forEach(activeId => {
            const activeChar = characters.find(c => c.id === activeId);
            if (activeChar) {
              if (activeChar.group.toUpperCase().includes(condTarget) || 
                  activeChar.type.toUpperCase() === condTarget) {
                count++;
              }
            }
          });
          
          if (count >= requiredCount) {
            isActivated = true;
          }
        }
        
        const item = {
          charId: leaderChar.id,
          charName: leaderChar.name,
          accentColor: '#ffb703',
          desc: outfitText,
          isLeader: true
        };
        
        if (isActivated) {
          active.push(item);
        } else {
          inactive.push(item);
        }
      }
    }
    // 2. Evaluate normal passives
    uniqueActiveIds.forEach(id => {
      const char = characters.find(c => c.id === id);
      if (char && char.skills && char.skills.passive) {
        const passiveText = char.skills.passive;
        let isActivated = false;
        
        const match = passiveText.match(/(?:with\s+(\d+)\s+or\s+more|to\s+(\d+))\s+([A-Za-z0-9\s\-++]+)\s+Members/i);
        
        if (!match) {
          isActivated = true;
        } else {
          const requiredCount = parseInt(match[1] || match[2]) || 2;
          const rawTarget = match[3].trim().toUpperCase();
          const condTarget = rawTarget
            .replace(/[[\]]/g, '')
            .replace(/\bTYPE\b/g, '')
            
            .trim();
          
          let count = 0;
          uniqueActiveIds.forEach(activeId => {
            const activeChar = characters.find(c => c.id === activeId);
            if (activeChar) {
              if (activeChar.group.toUpperCase().includes(condTarget) || 
                  activeChar.type.toUpperCase() === condTarget) {
                count++;
              }
            }
          });
          
          if (count >= requiredCount) {
            isActivated = true;
          }
        }
        
        const item = {
          charId: char.id,
          charName: char.name,
          accentColor: char.accentColor,
          desc: passiveText,
          isLeader: false
        };
        
        if (isActivated) {
          active.push(item);
        } else {
          inactive.push(item);
        }
      }
    });
    // Sort active so leader skill is ALWAYS first
    active.sort((a, b) => {
      if (a.isLeader && !b.isLeader) return -1;
      if (!a.isLeader && b.isLeader) return 1;
      return 0;
    });
    return { active, inactive };
  };
  const getRecommendedSynergies = () => {
    if (!recommendedTeamResult) return [];
    const synergies = [];
    const uniqueActiveIds = Array.from(new Set([...recommendedTeamResult.team, recommendedTeamResult.leader].filter(Boolean)));
    
    // 1. Leader Outfit Skill first
    const recLeader = recommendedTeamResult.leader;
    if (recLeader) {
      const leaderChar = characters.find(c => c.id === recLeader);
      if (leaderChar && leaderChar.skills && leaderChar.skills.outfit) {
        const outfitText = leaderChar.skills.outfit;
        let isActivated = false;
        
        const match = outfitText.match(/(?:with\s+(\d+)\s+or\s+more|to\s+(\d+))\s+([A-Za-z0-9\s\-++]+)\s+Members/i);
        
        if (!match) {
          isActivated = true;
        } else {
          const requiredCount = parseInt(match[1] || match[2]) || 2;
          const rawTarget = match[3].trim().toUpperCase();
          const condTarget = rawTarget
            .replace(/[[\]]/g, '')
            .replace(/\bTYPE\b/g, '')
            
            .trim();
          
          let count = 0;
          uniqueActiveIds.forEach(activeId => {
            const activeChar = characters.find(c => c.id === activeId);
            if (activeChar) {
              if (activeChar.group.toUpperCase().includes(condTarget) || 
                  activeChar.type.toUpperCase() === condTarget) {
                count++;
              }
            }
          });
          
          if (count >= requiredCount) {
            isActivated = true;
          }
        }
        
        if (isActivated) {
          synergies.push({
            charId: leaderChar.id,
            charName: leaderChar.name,
            accentColor: '#ffb703', // Use Leader Gold color!
            desc: outfitText,
            isLeader: true
          });
        }
      }
    }
    // 2. Normal Passives
    uniqueActiveIds.forEach(id => {
      const char = characters.find(c => c.id === id);
      if (char && char.skills && char.skills.passive) {
        const passiveText = char.skills.passive;
        let isActivated = false;
        
        const match = passiveText.match(/(?:with\s+(\d+)\s+or\s+more|to\s+(\d+))\s+([A-Za-z0-9\s\-++]+)\s+Members/i);
        
        if (!match) {
          isActivated = true;
        } else {
          const requiredCount = parseInt(match[1] || match[2]) || 2;
          const rawTarget = match[3].trim().toUpperCase();
          const condTarget = rawTarget
            .replace(/[[\]]/g, '')
            .replace(/\bTYPE\b/g, '')
            
            .trim();
          
          let count = 0;
          uniqueActiveIds.forEach(activeId => {
            const activeChar = characters.find(c => c.id === activeId);
            if (activeChar) {
              if (activeChar.group.toUpperCase().includes(condTarget) || 
                  activeChar.type.toUpperCase() === condTarget) {
                count++;
              }
            }
          });
          
          if (count >= requiredCount) {
            isActivated = true;
          }
        }
        
        if (isActivated) {
          synergies.push({
            charId: char.id,
            charName: char.name,
            accentColor: char.accentColor,
            desc: passiveText,
            isLeader: false
          });
        }
      }
    });
    
    return synergies;
  };
  const { active: activeSynergies } = getSynergiesState();
  const filteredRoster = characters.filter(char => char.name.toLowerCase().includes(searchQuery.toLowerCase()));
  
  const leaderChar = characters.find(c => c.id === activeLeader);
  const isLeaderInTeam = activeTeam.includes(activeLeader);
  const activeCharsCount = [activeLeader, ...activeTeam].filter(Boolean).reduce((acc, charId, idx) => {
    if (charId === activeLeader && idx > 0) return acc;
    const isLeader = charId === activeLeader;
    const char = characters.find(c => c.id === charId);
    if (!char) return acc;
    const isActivePassive = activeSynergies.some(s => s.charId === char.id && !s.isLeader);
    const isLeaderSkillActive = !isLeader || activeSynergies.some(s => s.charId === char.id && s.isLeader);
    return (isActivePassive && isLeaderSkillActive) ? acc + 1 : acc;
  }, 0);
  return (
    <div className="team-builder-page animate-fade-in">
      <div className="builder-header">
        <h1 className="page-title">{t('builder_title')}</h1>
        <p className="page-subtitle">{t('builder_desc')}</p>
      </div>
      {/* Presets Manager */}
      <div className="presets-manager glass">
        <div className="presets-header">
          <h3 className="section-title-small">{t('presets_manager')}</h3>
          <span className="presets-info-text">{t('presets_desc')}</span>
        </div>
        
        <div className="presets-list-bar">
          {presets.map((preset) => (
            <button
              key={preset.id}
              className={`preset-selector-btn ${selectedPresetId === preset.id ? 'selected' : ''} ${preset.isActive ? 'active-deck' : ''}`}
              onClick={() => {
                setSelectedPresetId(preset.id);
                setIsEditingName(false);
              }}
            >
              {preset.isActive && <Award size={12} className="text-gold mr-1" />}
              <span className="preset-btn-name">{preset.name}</span>
            </button>
          ))}
        </div>
        <div className="preset-actions-bar">
          <div className="preset-meta-info">
            {isEditingName ? (
              <div className="rename-input-wrapper">
                <input
                  type="text"
                  value={newNameInput}
                  onChange={(e) => setNewNameInput(e.target.value)}
                  className="rename-input glass"
                  maxLength={25}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveRename();
                    if (e.key === 'Escape') setIsEditingName(false);
                  }}
                />
                <button className="btn-rename-save" onClick={handleSaveRename}>Save</button>
                <button className="btn-rename-cancel" onClick={() => setIsEditingName(false)}>{t('cancel')}</button>
              </div>
            ) : (
              <div className="preset-name-display">
                <span className="current-preset-label">{t('editing_label')}</span>
                <strong className="current-preset-value">{currentPreset.name}</strong>
                <button className="btn-icon-rename" onClick={handleStartRename} title="Rename preset">
                  {t('rename_preset')}
                </button>
              </div>
            )}
          </div>
          <div className="preset-control-buttons">
            {!currentPreset.isActive && (
              <button 
                className="btn-activate-preset" 
                onClick={() => onUpdatePreset(selectedPresetId, { isActive: true })}
              >
                {t('make_active')}
              </button>
            )}
            {currentPreset.isActive && (
              <span className="active-party-badge">
                <CheckCircle2 size={12} className="text-green" /> {t('primary_active_party')}
              </span>
            )}
            <button 
              className="btn-clear-preset" 
              onClick={() => {
                if (window.confirm(`Are you sure you want to clear "${currentPreset.name}" slots?`)) {
                  onUpdatePreset(selectedPresetId, { team: [null, null, null, null, null], leader: null });
                }
              }}
            >
              {t('clear_slots')}
            </button>
          </div>
        </div>
      </div>
      {/* Owned Roster Manager */}
      <div className="roster-manager glass">
        <div className="roster-header" onClick={() => setIsRosterExpanded(!isRosterExpanded)}>
          <div className="roster-header-title-block">
            <h3 className="section-title-small">{t('my_character_roster')}</h3>
            <span className="presets-info-text">
              {t('roster_desc', { owned: ownedRoster.length, total: characters.length })}
            </span>
          </div>
          <button className="btn-toggle-roster">
            {isRosterExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>
        {isRosterExpanded && (
          <div className="roster-body animate-slide-down">
            <div className="roster-controls">
              <button className="btn-icon-rename" onClick={() => onUpdateOwnedRoster(characters.map(c => c.id))}>
                {t('select_all')}
              </button>
              <button className="btn-icon-rename" onClick={() => onUpdateOwnedRoster([])}>
                {t('deselect_all')}
              </button>
              <button 
                className="btn-activate-preset" 
                onClick={handleGenerateRecommendation}
                disabled={ownedRoster.length < 5}
                style={{ opacity: ownedRoster.length < 5 ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: '0.25rem' }}
              >
                <Sparkles size={12} /> {t('smart_suggest')}
              </button>
            </div>
            <div className="roster-groups-container">
              {GROUPS.map(groupName => {
                const groupMembers = characters.filter(c => c.group === groupName);
                if (groupMembers.length === 0) return null;
                return (
                  <div key={groupName} className="roster-group-section">
                    <h5 className="roster-group-title">{groupName}</h5>
                    <div className="roster-group-grid">
                      {groupMembers.map(char => {
                        const isOwned = ownedRoster.includes(char.id);
                        return (
                          <div 
                            key={char.id} 
                            className={`roster-char-item ${isOwned ? 'owned' : 'not-owned'}`}
                            onClick={() => handleToggleOwned(char.id)}
                          >
                            <input 
                              type="checkbox" 
                              checked={isOwned} 
                              readOnly 
                              className="roster-char-checkbox"
                            />
                            <div className="roster-char-avatar-mini" style={{ borderLeft: `3px solid ${char.accentColor}`, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {char.image ? (
                                <img src={char.image} alt={char.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : (
                                char.avatar
                              )}
                            </div>
                            <span className="roster-char-name" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: '1.2' }}>
                              <span>{char.name}</span>
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 'normal' }}>{char.title}</span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      {/* Recommendation Modal */}
      {showRecommendationModal && recommendedTeamResult && (
        <div className="modal-overlay" onClick={() => setShowRecommendationModal(false)}>
          <div className="modal-content glass" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '850px' }}>
            <div className="modal-header">
              <div className="modal-header-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={20} className="text-gold animate-pulse" />
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>Smart Team Recommendation</h2>
              </div>
              <button className="btn-close-modal" onClick={() => setShowRecommendationModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <p className="recommendation-desc">
                We analyzed your owned roster and generated the team with the highest possible active synergies (<strong>{recommendedTeamResult.passiveCount} passives</strong> triggered).
              </p>
              <h3 className="modal-section-title">Recommended Party</h3>
              <div className="recommended-team-slots">
                {recommendedTeamResult.team.map((charId) => {
                  const char = characters.find(c => c.id === charId);
                  const isLeader = charId === recommendedTeamResult.leader;
                  if (!char) return null;
                  return (
                    <div key={charId} className={`recommended-slot-card ${isLeader ? 'border-gold' : ''}`}>
                      {isLeader && <span className="leader-tag-mini">L</span>}
                      <div className="recommended-avatar-circle" style={{ border: `2px solid ${char.accentColor}`, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {char.image ? (
                          <img src={char.image} alt={char.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <span className="recommended-avatar-text">{char.avatar}</span>
                        )}
                      </div>
                      <div className="recommended-slot-info">
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <strong className="recommended-char-name">{char.name}</strong>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '3px' }}>{char.title}</span>
                        </div>
                        <span className="recommended-char-meta" style={{ color: getTypeColor(char.type) }}>
                          {getTypeIcon(char.type)} {typeDisplayMap[char.type] || char.type} • {char.group}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Collapsible Dropdown for Recommended Team Skills */}
              <div className="roster-manager glass" style={{ marginTop: '1.25rem', width: '100%' }}>
                <div 
                  className="roster-header" 
                  onClick={() => setIsRecSkillsExpanded(!isRecSkillsExpanded)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="roster-header-title-block">
                    <h3 className="section-title-small" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <CheckCircle2 size={16} className="text-green" />
                      {t('active_passives')} ({(() => {
                      const recSynergies = getRecommendedSynergies();
                      return recommendedTeamResult.team.filter(Boolean).reduce((acc, charId) => {
                        const isLeader = charId === recommendedTeamResult.leader;
                        const char = characters.find(c => c.id === charId);
                        if (!char) return acc;
                        const isActivePassive = recSynergies.some(s => s.charId === char.id && !s.isLeader);
                        const isLeaderSkillActive = !isLeader || recSynergies.some(s => s.charId === char.id && s.isLeader);
                        return (isActivePassive && isLeaderSkillActive) ? acc + 1 : acc;
                      }, 0);
                    })()}/5 {t('characters')})
                    </h3>
                    <span className="presets-info-text">
                      Detailed active, special, and passive skill overview for recommended team members
                    </span>
                  </div>
                  <button className="btn-toggle-roster" style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                    {isRecSkillsExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </button>
                </div>
                
                {isRecSkillsExpanded && (
                  <div className="roster-body animate-slide-down" style={{ marginTop: '1rem' }}>
                    <div className="recommended-passives-list" style={{ maxHeight: '350px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {recommendedTeamResult.team.map((charId) => {
                        const char = characters.find(c => c.id === charId);
                        if (!char) return null;
                        
                        const isLeader = charId === recommendedTeamResult.leader;
                        const recSynergies = getRecommendedSynergies();
                        const isActivePassive = recSynergies.some(s => s.charId === char.id && !s.isLeader);
                        const passiveText = char.skills.passive;
                        return (
                          <div key={char.id} className="synergy-bonus-item glass" style={{ padding: '0.85rem', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '0.5rem', display: 'block' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: char.accentColor }} />
                                <strong style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>{char.name}</strong>
                                <span style={{ fontSize: '0.7rem', color: isLeader ? '#ffb703' : 'var(--text-muted)', fontWeight: 700 }}>
                                  {isLeader ? `(${t('leader_tag')})` : `(${t('member_tag')})`}
                                </span>
                              </div>
                              
                              {passiveText && (
                                <span style={{ 
                                  fontSize: '0.65rem', 
                                  fontWeight: 700, 
                                  padding: '1px 6px', 
                                  borderRadius: '4px',
                                  background: isActivePassive ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255, 255, 255, 0.05)',
                                  color: isActivePassive ? '#10b981' : 'var(--text-muted)',
                                  border: isActivePassive ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid var(--border-color)'
                                }}>
                                  {isActivePassive ? 'ALL SKILLS ACTIVE' : 'SKILLS INACTIVE'}
                                </span>
                              )}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: passiveText ? '0.65rem' : 0 }}>
                              <div style={{ background: 'rgba(255,255,255,0.01)', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.04)' }}>
                                <div style={{ fontSize: '0.68rem', fontWeight: 800, color: char.accentColor, marginBottom: '3px', textTransform: 'uppercase' }}>{t('special_skill')}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-primary)', lineHeight: '1.4' }}>{char.skills.special}</div>
                              </div>
                              <div style={{ background: 'rgba(255,255,255,0.01)', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.04)' }}>
                                <div style={{ fontSize: '0.68rem', fontWeight: 800, color: char.accentColor, marginBottom: '3px', textTransform: 'uppercase' }}>{t('active_skill')}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-primary)', lineHeight: '1.4' }}>{char.skills.active}</div>
                              </div>
                            </div>
                            {passiveText && (
                              <div style={{ background: isActivePassive ? 'rgba(16, 185, 129, 0.02)' : 'rgba(255, 255, 255, 0.01)', padding: '6px 8px', borderRadius: '6px', border: isActivePassive ? '1px solid rgba(16, 185, 129, 0.1)' : '1px solid rgba(255, 255, 255, 0.04)' }}>
                                <div style={{ fontSize: '0.68rem', fontWeight: 800, color: char.accentColor, marginBottom: '3px', textTransform: 'uppercase' }}>
                                  {t('passive_skill')}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: isActivePassive ? 'var(--text-primary)' : 'var(--text-muted)', lineHeight: '1.4' }}>
                                  {passiveText}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div> {/* Closing modal-body */}
            <div className="modal-footer" style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
              <button className="btn-clear-preset" onClick={() => setShowRecommendationModal(false)}>
                {t('cancel')}
              </button>
              <button className="btn-activate-preset" onClick={handleApplyRecommendation}>
                Apply to {currentPreset.name}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="builder-single-column-layout">
        {/* Row 1: Team Configuration Container */}
        <div className="slots-container glass">
          <h2 className="section-title"><Users className="title-icon" /> Current Team</h2>
          
          <div className="config-grid">
            {/* {t('leader_slot_title')} */}
            <div className="leader-config-block">
              <h4 className="config-block-title"><Award size={14} className="text-gold" /> {t('leader_slot_title')}</h4>
              
              <div 
                className={`leader-slot glass ${leaderChar ? 'occupied border-gold' : 'empty'} ${activeSlotIndex === 'leader' ? 'active-focused-slot' : ''}`}
                style={leaderChar ? { '--char-glow': leaderChar.accentColor, cursor: leaderChar ? 'grab' : 'pointer' } : null}
                onClick={() => setActiveSlotIndex(activeSlotIndex === 'leader' ? null : 'leader')}
                draggable={!!leaderChar}
                onDragStart={(e) => handleDragStart(e, 'leader', null)}
                onDragOver={handleDragOver}
                onDrop={handleDropOnLeaderSlot}
              >
                {leaderChar ? (
                  <div className="slot-content">
                    <span className="leader-badge-ribbon">LEADER</span>
                    <div className="slot-img-wrapper border-gold">
                      {leaderChar.image ? (
                        <img src={leaderChar.image} alt={leaderChar.name} className="slot-img" />
                      ) : (
                        <span className="slot-avatar">{leaderChar.avatar}</span>
                      )}
                    </div>
                    <div className="slot-details">
                      <h4 className="slot-name">{leaderChar.name}</h4>
                      <span className="slot-title" style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'block', margin: '2px 0' }}>{leaderChar.title}</span>
                      <span className="slot-role">{leaderChar.group}</span>
                      <span className="slot-element" style={{ color: getTypeColor(leaderChar.type) }}>
                        {getTypeIcon(leaderChar.type)}
                        {typeDisplayMap[leaderChar.type] || leaderChar.type}
                      </span>
                    </div>
                    <button 
                      className="btn-remove-slot" 
                      onClick={handleClearLeader}
                      title="Gỡ bỏ Leader"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="slot-placeholder text-gold">
                    <span className="plus-sign">★</span>
                    <span>{activeSlotIndex === 'leader' ? t('selecting_leader_placeholder') : t('empty_leader_placeholder')}</span>
                  </div>
                )}
              </div>
              {activeLeader && (
                <div className="recommendation-badge-container">
                  {isLeaderInTeam ? (
                    <div className="recommendation-badge success-badge">
                      <CheckCircle2 size={12} /> Leader is a Team Unit (Recommended)
                    </div>
                  ) : (
                    <div className="recommendation-badge warning-badge">
                      <AlertCircle size={12} /> Leader is not in Team Units (Not recommended)
                    </div>
                  )}
                </div>
              )}
              {activeLeader && leaderChar && (() => {
                const isLeaderSkillActive = activeSynergies.some(s => s.charId === activeLeader && s.isLeader);
                return (
                  <div 
                    className="leader-skill-box glass animate-slide-down" 
                    style={{ 
                      marginTop: '0.75rem', 
                      padding: '0.85rem', 
                      borderRadius: '10px', 
                      border: isLeaderSkillActive ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid rgba(239, 68, 68, 0.25)', 
                      background: isLeaderSkillActive ? 'rgba(16, 185, 129, 0.02)' : 'rgba(239, 68, 68, 0.02)', 
                      textAlign: 'left' 
                    }}
                  >
                    <h5 style={{ margin: 0, fontSize: '0.75rem', fontWeight: 800, color: isLeaderSkillActive ? '#10b981' : '#ef4444', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                      {isLeaderSkillActive ? <CheckCircle2 size={13} style={{ color: '#10b981' }} /> : <AlertTriangle size={13} style={{ color: '#ef4444' }} />}
                      {t('leader_skill')} (Outfit Skill)
                    </h5>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: isLeaderSkillActive ? 'var(--text-primary)' : 'var(--text-muted)', lineHeight: '1.45' }}>
                      {leaderChar.skills.outfit}
                    </p>
                  </div>
                );
              })()}
            </div>
            {/* Members Slots Grid */}
            <div className="members-config-block">
              <h4 className="config-block-title"><Users size={14} /> {t('team_units_title')}</h4>
              <div className="slots-grid five-slots">
                {[0, 1, 2, 3, 4].map((index) => {
                  const charId = activeTeam[index];
                  const char = characters.find(c => c.id === charId);
                  const isSlotFocused = activeSlotIndex === index;
                  return (
                    <div 
                      key={index} 
                      className={`builder-slot glass ${char ? 'occupied' : 'empty'} ${isSlotFocused ? 'active-focused-slot' : ''}`}
                      style={char ? { '--char-glow': char.accentColor, cursor: char ? 'grab' : 'pointer' } : null}
                      onClick={() => setActiveSlotIndex(isSlotFocused ? null : index)}
                      draggable={!!char}
                      onDragStart={(e) => handleDragStart(e, 'team', index)}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDropOnTeamSlot(e, index)}
                    >
                      {char ? (
                        <div className="slot-content">
                          {activeLeader === char.id && <span className="leader-tag-mini">L</span>}
                          <div className="slot-img-wrapper">
                            {char.image ? (
                              <img src={char.image} alt={char.name} className="slot-img" />
                            ) : (
                              <span className="slot-avatar">{char.avatar}</span>
                            )}
                          </div>
                          <div className="slot-details">
                            <div className="slot-name-block" style={{ display: 'flex', flexDirection: 'column', gap: '2px', lineHeight: '1.2' }}>
                              <h4 className="slot-name" style={{ margin: 0, fontSize: '0.92rem' }}>{char.name}</h4>
                              <span className="slot-title" style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{char.title}</span>
                            </div>
                            <span className="slot-role">{char.group}</span>
                            <span className="slot-element" style={{ color: getTypeColor(char.type) }}>
                              {getTypeIcon(char.type)}
                              {typeDisplayMap[char.type] || char.type}
                            </span>
                          </div>
                          <button 
                            className="btn-remove-slot" 
                            onClick={(e) => handleClearSlot(index, e)}
                            title="Remove"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ) : (
                        <div className="slot-placeholder">
                          <span className="plus-sign">+</span>
                          <span>{isSlotFocused ? t('selecting_slot_placeholder', { num: index + 1 }) : t('empty_slot_placeholder', { num: index + 1 })}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <button 
            className="btn-primary w-full mt-4" 
            onClick={() => onSavePresets()}
            disabled={activeTeam.filter(Boolean).length === 0}
            style={{ opacity: activeTeam.filter(Boolean).length === 0 ? 0.5 : 1 }}
          >
            {t('save_presets')}
          </button>
        </div>
        {/* Row 2: Unified Active Skills List styled like Roster Manager */}
        <div className="roster-manager glass" style={{ marginTop: '1.25rem', width: '100%' }}>
          <div 
            className="roster-header" 
            onClick={() => setIsActiveExpanded(!isActiveExpanded)}
            style={{ cursor: 'pointer' }}
          >
            <div className="roster-header-title-block">
              <h3 className="section-title-small" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={16} className="text-green" />
                {t('active_passives')} ({activeCharsCount}/5 {t('characters')})
              </h3>
              <span className="presets-info-text">
                {activeTeam.filter(Boolean).length > 0 || activeLeader
                  ? 'Detailed active, special, and passive skill overview for current team members'
                  : t('add_members_msg')
                }
              </span>
            </div>
            <button className="btn-toggle-roster" style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
              {isActiveExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>
          </div>
          
          {isActiveExpanded && (
            <div className="roster-body animate-slide-down" style={{ marginTop: '1rem' }}>
              {(activeTeam.filter(Boolean).length > 0 || activeLeader) ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {/* Leader first */}
                  {[activeLeader, ...activeTeam].filter(Boolean).map((charId, idx) => {
                    // Avoid duplicate rendering if leader is also in team units
                    if (charId === activeLeader && idx > 0) return null;
                    const isLeader = charId === activeLeader;
                    const char = characters.find(c => c.id === charId);
                    if (!char) return null;
                    
                    const isActivePassive = activeSynergies.some(s => s.charId === char.id && !s.isLeader);
                    const passiveText = char.skills.passive;
                    
                    return (
                      <div key={char.id} className="synergy-bonus-item glass" style={{ padding: '0.85rem', borderRadius: '10px', border: '1px solid var(--border-color)', display: 'block' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: char.accentColor }} />
                            <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{char.name}</strong>
                            <span style={{ fontSize: '0.72rem', color: isLeader ? '#ffb703' : 'var(--text-muted)', fontWeight: 700 }}>
                              {isLeader ? `(${t('leader_tag')})` : `(${t('member_tag')})`}
                            </span>
                          </div>
                          
                          {/* Passive status indicator */}
                          {passiveText && (
                            <span style={{ 
                              fontSize: '0.7rem', 
                              fontWeight: 700, 
                              padding: '2px 8px', 
                              borderRadius: '4px',
                              background: isActivePassive ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255, 183, 3, 0.05)',
                              color: isActivePassive ? '#10b981' : 'var(--text-muted)',
                              border: isActivePassive ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid var(--border-color)'
                            }}>
                              {isActivePassive ? 'ALL SKILLS ACTIVE' : 'SKILLS INACTIVE'}
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: passiveText ? '0.75rem' : 0 }}>
                          <div style={{ background: 'rgba(255,255,255,0.01)', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.04)' }}>
                            <div style={{ fontSize: '0.68rem', fontWeight: 800, color: char.accentColor, marginBottom: '3px', textTransform: 'uppercase' }}>{t('special_skill')}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-primary)', lineHeight: '1.4' }}>{char.skills.special}</div>
                          </div>
                          <div style={{ background: 'rgba(255,255,255,0.01)', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.04)' }}>
                            <div style={{ fontSize: '0.68rem', fontWeight: 800, color: char.accentColor, marginBottom: '3px', textTransform: 'uppercase' }}>{t('active_skill')}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-primary)', lineHeight: '1.4' }}>{char.skills.active}</div>
                          </div>
                        </div>
                        {passiveText && (
                          <div style={{ background: isActivePassive ? 'rgba(16, 185, 129, 0.02)' : 'rgba(255,255,255,0.01)', padding: '8px 10px', borderRadius: '6px', border: isActivePassive ? '1px solid rgba(16, 185, 129, 0.1)' : '1px solid rgba(255,255,255,0.04)' }}>
                            <div style={{ fontSize: '0.68rem', fontWeight: 800, color: char.accentColor, marginBottom: '3px', textTransform: 'uppercase' }}>
                              {t('passive_skill')}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: isActivePassive ? 'var(--text-primary)' : 'var(--text-muted)', lineHeight: '1.4' }}>
                              {passiveText}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-analytics" style={{ padding: '2rem 1rem' }}>
                  <AlertCircle size={24} className="text-muted" />
                  <p>{t('add_members_msg')}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {/* Roster Character Selection Popup Modal */}
      {activeSlotIndex !== null && (
        <div className="modal-overlay" onClick={() => setActiveSlotIndex(null)}>
          <div className="modal-content glass animate-scale-up" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '1150px', width: '95%' }}>
            <div className="modal-header">
              <div className="modal-header-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Users size={20} className="text-gold" />
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>
                  {activeSlotIndex === 'leader' ? 'Select Team Leader' : `Select Unit for Slot ${activeSlotIndex + 1}`}
                </h2>
              </div>
              <button className="btn-close-modal" onClick={() => setActiveSlotIndex(null)}>
                <X size={18} />
              </button>
            </div>
            
            <div className="modal-body" style={{ maxHeight: '65vh', overflowY: 'auto', padding: '1.5rem' }}>
              <div className="roster-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', gap: '15px' }}>
                <p className="presets-info-text" style={{ margin: 0 }}>
                  {activeSlotIndex === 'leader' 
                    ? 'Assign a leader to activate their leader synergy bonuses.' 
                    : `Choose a member card to occupy Slot ${activeSlotIndex + 1}.`
                  }
                </p>
                <input
                  type="text"
                  placeholder={t('search_placeholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="roster-search-input glass"
                  style={{ width: '250px', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: '#fff' }}
                  autoFocus
                />
              </div>
              <div className="character-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(225px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
                {filteredRoster.map((char) => {
                  const isSelected = activeTeam.includes(char.id);
                  return (
                    <div
                      key={char.id}
                      className={`char-card glass ${isSelected ? 'selected' : ''}`}
                      onClick={() => handleSelectCharacter(char.id)}
                      style={{ 
                        '--hover-color': char.accentColor,
                        cursor: 'pointer',
                        position: 'relative',
                        border: isSelected ? `2px solid ${char.accentColor}` : '1px solid rgba(255,255,255,0.08)',
                        background: isSelected ? `${char.accentColor}10` : 'rgba(255,255,255,0.02)',
                        boxShadow: isSelected ? `0 0 15px ${char.accentColor}30` : 'none',
                        transform: 'none',
                        margin: 0
                      }}
                    >
                      <div className="rarity-badge">{char.rarity}</div>
                      <div className="char-card-body" style={{ padding: '0.5rem' }}>
                        <div className="char-card-media-wrapper" style={{ width: '75px', height: '75px', borderRadius: '50%', overflow: 'hidden', border: `2px solid ${char.accentColor}`, marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.2))' }}>
                          {char.image ? (
                            <img src={char.image} alt={char.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <div className="char-card-avatar-fallback" style={{ fontSize: '1.6rem', fontWeight: 'bold' }}>{char.avatar}</div>
                          )}
                        </div>
                        <h3 className="char-card-name" style={{ fontSize: '1.05rem', fontWeight: '700', marginBottom: '4px' }}>{char.name}</h3>
                        <p className="char-card-title" style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>{char.title}</p>
                        
                        <div className="char-card-badges" style={{ flexWrap: 'nowrap', gap: '0.4rem', justifyContent: 'center', width: '100%' }}>
                          <span className="badge-role" style={{ whiteSpace: 'nowrap', padding: '0.25rem 0.45rem' }}>
                            <Users size={10} className="mr-1" />
                            {char.group}
                          </span>
                          <span className="badge-elem" style={{ color: getTypeColor(char.type), whiteSpace: 'nowrap', padding: '0.25rem 0.45rem' }}>
                            {getTypeIcon(char.type)}
                            {typeDisplayMap[char.type] || char.type}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}