import React, { useState } from 'react';
import { Trash2, Users, AlertCircle, CheckCircle2, ShieldAlert, Award } from 'lucide-react';
import { CHARACTERS } from '../data';
import './TeamBuilder.css';

export default function TeamBuilder({ activeTeam, setActiveTeam, activeLeader, setActiveLeader, onSaveTeam }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSlotIndex, setActiveSlotIndex] = useState(null); // 'leader' or 0, 1, 2, 3, 4 or null

  const getTypeColor = (type) => {
    switch (type) {
      case 'PURE': return '#06b6d4'; // Cyan
      case 'CUTE': return '#ef4444'; // Red
      case 'HAPPY': return '#f59e0b'; // Orange
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
  const getActiveSynergies = () => {
    const synergies = [];
    const uniqueActiveIds = Array.from(new Set([...activeTeam, activeLeader].filter(Boolean)));
    
    uniqueActiveIds.forEach(id => {
      const char = CHARACTERS.find(c => c.id === id);
      if (char && char.skills && char.skills.passive) {
        const passiveText = char.skills.passive;
        let isActivated = false;
        
        // Match condition like "2 or higher GEN 0" or "to 2 [HAPPY] members"
        const matchOrMore = passiveText.match(/(\d+)\s+or\s+(?:more|higher)\s+([A-Za-z0-9\s\-\+]+)/i);
        const matchToMembers = passiveText.match(/to\s+(\d+)\s+\[?([A-Za-z0-9\s\-\+]+)\]?\s+members/i);
        
        if (!matchOrMore && !matchToMembers) {
          // No condition -> always active
          isActivated = true;
        } else {
          const match = matchOrMore || matchToMembers;
          const requiredCount = parseInt(match[1]) || 2;
          const rawTarget = match[2].trim().toUpperCase();
          const condTarget = rawTarget
            .replace(/[\[\]]/g, '')
            .replace(/\bTYPE\b/g, '')
            .replace(/\bMEMBERS?\b/g, '')
            .trim();
          
          // Count matching members in uniqueActiveIds
          let count = 0;
          uniqueActiveIds.forEach(activeId => {
            const activeChar = CHARACTERS.find(c => c.id === activeId);
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
            bonus: `${char.name} (Passive)`,
            desc: passiveText
          });
        }
      }
    });

    return synergies;
  };

  const activeSynergies = getActiveSynergies();
  const selectedChars = CHARACTERS.filter(c => activeTeam.includes(c.id));
  const filteredRoster = CHARACTERS.filter(char => char.name.toLowerCase().includes(searchQuery.toLowerCase()));
  
  const leaderChar = CHARACTERS.find(c => c.id === activeLeader);
  const isLeaderInTeam = activeTeam.includes(activeLeader);

  // Check if all team slots are full
  const isTeamFull = activeTeam.filter(Boolean).length >= 5;

  return (
    <div className="team-builder-page animate-fade-in">
      <div className="builder-header">
        <h1 className="page-title">Team Builder</h1>
        <p className="page-subtitle">Click on any slot to assign members or the Leader. Match VTuber requirements to trigger Passive Skills.</p>
      </div>

      <div className="builder-single-column-layout">
        {/* Row 1: Team Configuration Container */}
        <div className="slots-container glass">
          <h2 className="section-title"><Users className="title-icon" /> Current Team</h2>
          
          <div className="config-grid">
            {/* Leader Slot */}
            <div className="leader-config-block">
              <h4 className="config-block-title"><Award size={14} className="text-gold" /> Leader Slot</h4>
              
              <div 
                className={`leader-slot glass ${leaderChar ? 'occupied border-gold' : 'empty'} ${activeSlotIndex === 'leader' ? 'active-focused-slot' : ''}`}
                style={leaderChar ? { '--char-glow': leaderChar.accentColor } : null}
                onClick={() => setActiveSlotIndex(activeSlotIndex === 'leader' ? null : 'leader')}
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
                      <span className="slot-role">{leaderChar.group}</span>
                      <span className="slot-element" style={{ color: getTypeColor(leaderChar.type) }}>{leaderChar.type}</span>
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
                    <span>{activeSlotIndex === 'leader' ? 'Selecting Leader...' : 'Click to Select Leader'}</span>
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
            </div>

            {/* Members Slots Grid */}
            <div className="members-config-block">
              <h4 className="config-block-title"><Users size={14} /> Team Units (Max 5)</h4>
              <div className="slots-grid five-slots">
                {[0, 1, 2, 3, 4].map((index) => {
                  const charId = activeTeam[index];
                  const char = CHARACTERS.find(c => c.id === charId);
                  const isSlotFocused = activeSlotIndex === index;
                  return (
                    <div 
                      key={index} 
                      className={`builder-slot glass ${char ? 'occupied' : 'empty'} ${isSlotFocused ? 'active-focused-slot' : ''}`}
                      style={char ? { '--char-glow': char.accentColor } : null}
                      onClick={() => setActiveSlotIndex(isSlotFocused ? null : index)}
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
                            <h4 className="slot-name">{char.name}</h4>
                            <span className="slot-role">{char.group}</span>
                            <span className="slot-element" style={{ color: getTypeColor(char.type) }}>{char.type}</span>
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
                          <span>{isSlotFocused ? `Selecting Slot ${index + 1}...` : `Slot ${index + 1}: Click to Select`}</span>
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
            onClick={onSaveTeam}
            disabled={activeTeam.filter(Boolean).length === 0}
            style={{ opacity: activeTeam.filter(Boolean).length === 0 ? 0.5 : 1 }}
          >
            Save Team to Profile
          </button>
        </div>

        {/* Row 2: Active Passives (Full Width) */}
        <div className="synergy-card glass">
          <h3 className="section-title">Active Passive Skills</h3>
          {activeSynergies.length > 0 ? (
            <div className="synergies-grid-layout">
              <div className="synergies-grid">
                {activeSynergies.map((syn, idx) => (
                  <div 
                    key={idx} 
                    className="synergy-bonus-item glass"
                    style={{ borderColor: syn.accentColor, background: `${syn.accentColor}06`, borderWidth: '1px', borderStyle: 'solid' }}
                  >
                    <div className="synergy-header">
                      <span className="synergy-badge-title" style={{ color: syn.accentColor, background: `${syn.accentColor}12` }}>{syn.bonus}</span>
                    </div>
                    <p className="synergy-desc">{syn.desc}</p>
                  </div>
                ))}
              </div>
              <div className="synergy-success mt-4">
                <CheckCircle2 size={16} className="text-green" />
                <span>Successfully activated {activeSynergies.length} Passive Skills!</span>
              </div>
            </div>
          ) : (
            <div className="empty-analytics">
              {selectedChars.length >= 2 ? (
                <>
                  <ShieldAlert size={24} className="text-orange" />
                  <p>Current team does not meet any Passive Skill activation requirements.</p>
                </>
              ) : (
                <>
                  <AlertCircle size={24} className="text-muted" />
                  <p>Add members to the team to check for active Passive Skills</p>
                </>
              )}
            </div>
          )}
        </div>

        {/* Row 3: Roster selection */}
        <div className="roster-selector glass">
          <div className="roster-header-row">
            <div>
              <h3 className="section-title">Select Characters to Add/Remove</h3>
              {isTeamFull && activeSlotIndex === null && (
                <p className="roster-warning-sub text-orange"><AlertCircle size={10} style={{ display: 'inline', marginRight: '3px' }} /> Team is full. Click a slot above to replace its character.</p>
              )}
            </div>
            <input
              type="text"
              placeholder="Search characters..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="roster-search-input glass"
            />
          </div>
          <div className="roster-grid">
            {filteredRoster.map((char) => {
              const isSelected = activeTeam.includes(char.id);
              const isDisabled = isTeamFull && !isSelected && activeSlotIndex === null;
              return (
                <div
                  key={char.id}
                  className={`roster-item glass ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled-roster' : ''}`}
                  onClick={() => !isDisabled && handleSelectCharacter(char.id)}
                  style={{ 
                    '--char-accent': char.accentColor,
                    opacity: isDisabled ? 0.35 : 1,
                    cursor: isDisabled ? 'not-allowed' : 'pointer'
                  }}
                  title={isDisabled ? 'Team is full. Select a slot to replace.' : ''}
                >
                  <div className="roster-item-media">
                    {char.image ? (
                      <img src={char.image} alt={char.name} className="roster-item-img" />
                    ) : (
                      <span className="roster-item-avatar">{char.avatar}</span>
                    )}
                  </div>
                  <div className="roster-item-details">
                    <span className="roster-item-name">{char.name}</span>
                    <span className="roster-item-role">{char.group}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
