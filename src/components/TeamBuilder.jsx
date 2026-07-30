import React from 'react';
import { Trash2, Users, AlertCircle, CheckCircle2, ShieldAlert, Award } from 'lucide-react';
import { CHARACTERS } from '../data';
import './TeamBuilder.css';

export default function TeamBuilder({ activeTeam, setActiveTeam, activeLeader, setActiveLeader, onSaveTeam }) {
  
  const handleSelectCharacter = (charId) => {
    if (activeTeam.includes(charId)) {
      // Remove character
      setActiveTeam(activeTeam.filter(id => id !== charId));
    } else {
      if (activeTeam.length >= 5) {
        // Replace last slot for smooth UX
        setActiveTeam([...activeTeam.slice(1), charId]);
      } else {
        // Add character
        setActiveTeam([...activeTeam, charId]);
      }
    }
  };

  const handleClearSlot = (index) => {
    const newTeam = [...activeTeam];
    newTeam.splice(index, 1);
    setActiveTeam(newTeam);
  };

  // Calculate dynamic team stats for the 5 member units
  const calculateTeamStats = () => {
    const selectedChars = CHARACTERS.filter(c => activeTeam.includes(c.id));
    if (selectedChars.length === 0) return { sense: 0, technique: 0, performance: 0, support: 0 };
    
    let totalSense = 0;
    let totalTech = 0;
    let totalPerf = 0;
    let totalSupp = 0;

    selectedChars.forEach(c => {
      totalSense += c.stats.sense;
      totalTech += c.stats.technique;
      totalPerf += c.stats.performance;
      totalSupp += c.stats.support;
    });

    const count = selectedChars.length;
    return {
      sense: Math.round(totalSense / count),
      technique: Math.round(totalTech / count),
      performance: Math.round(totalPerf / count),
      support: Math.round(totalSupp / count)
    };
  };

  // Find active synergies between all unique members on field
  const getActiveSynergies = () => {
    const synergies = [];
    const uniqueMembers = Array.from(new Set([...activeTeam, activeLeader].filter(Boolean)));
    const teamSet = new Set(uniqueMembers);

    uniqueMembers.forEach(charId => {
      const char = CHARACTERS.find(c => c.id === charId);
      if (char && char.synergies) {
        char.synergies.forEach(syn => {
          if (teamSet.has(syn.partnerId)) {
            // Avoid duplicates
            const exists = synergies.some(s => 
              (s.partnerId === charId && s.charId === syn.partnerId) || 
              (s.partnerId === syn.partnerId && s.charId === charId)
            );
            if (!exists) {
              synergies.push({
                charId: char.id,
                charName: char.name,
                partnerId: syn.partnerId,
                partnerName: CHARACTERS.find(c => c.id === syn.partnerId)?.name || 'Unknown',
                bonus: syn.bonus,
                desc: syn.desc
              });
            }
          }
        });
      }
    });

    return synergies;
  };

  const avgStats = calculateTeamStats();
  const activeSynergies = getActiveSynergies();
  const selectedChars = CHARACTERS.filter(c => activeTeam.includes(c.id));
  
  const leaderChar = CHARACTERS.find(c => c.id === activeLeader);
  const isLeaderInTeam = activeTeam.includes(activeLeader);

  return (
    <div className="team-builder-page animate-fade-in">
      <div className="builder-header">
        <h1 className="page-title">Team Builder</h1>
        <p className="page-subtitle">Thành lập đội hình 5 người của bạn, chỉ định Lập Sĩ (Leader) và kích hoạt cộng hưởng.</p>
      </div>

      <div className="builder-layout">
        {/* Left column: Slots & Roster selection */}
        <div className="builder-left">
          {/* Team Configuration Container */}
          <div className="slots-container glass">
            <h2 className="section-title"><Users className="title-icon" /> Đội hình hiện tại</h2>
            
            <div className="config-grid">
              {/* Leader Slot */}
              <div className="leader-config-block">
                <h4 className="config-block-title"><Award size={14} className="text-gold" /> Lập Sĩ (Leader)</h4>
                
                <div 
                  className={`leader-slot glass ${leaderChar ? 'occupied border-gold' : 'empty'}`}
                  style={leaderChar ? { '--char-glow': leaderChar.accentColor } : null}
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
                      <h4 className="slot-name">{leaderChar.name}</h4>
                      <span className="slot-role">{leaderChar.group}</span>
                    </div>
                  ) : (
                    <div className="slot-placeholder text-gold">
                      <span className="plus-sign">★</span>
                      <span>Chưa chọn Leader</span>
                    </div>
                  )}
                </div>

                <div className="leader-dropdown-container">
                  <select 
                    value={activeLeader || ""} 
                    onChange={(e) => setActiveLeader(e.target.value)}
                    className="leader-select-dropdown glass"
                  >
                    <option value="" disabled>-- Chọn Leader --</option>
                    {CHARACTERS.map(c => (
                      <option key={c.id} value={c.id}>{c.name} ({c.group})</option>
                    ))}
                  </select>
                </div>

                {activeLeader && (
                  <div className="recommendation-badge-container">
                    {isLeaderInTeam ? (
                      <div className="recommendation-badge success-badge">
                        <CheckCircle2 size={12} /> Leader là Team Unit (Khuyên dùng)
                      </div>
                    ) : (
                      <div className="recommendation-badge warning-badge">
                        <AlertCircle size={12} /> Leader không nằm trong Team Unit (Không khuyến nghị)
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Members Slots Grid */}
              <div className="members-config-block">
                <h4 className="config-block-title"><Users size={14} /> Team Units (Tối đa 5)</h4>
                <div className="slots-grid five-slots">
                  {[0, 1, 2, 3, 4].map((index) => {
                    const charId = activeTeam[index];
                    const char = CHARACTERS.find(c => c.id === charId);
                    return (
                      <div 
                        key={index} 
                        className={`builder-slot glass ${char ? 'occupied' : 'empty'}`}
                        style={char ? { '--char-glow': char.accentColor } : null}
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
                              <span className="slot-element" style={{ color: char.accentColor }}>{char.type}</span>
                            </div>
                            <button 
                              className="btn-remove-slot" 
                              onClick={() => handleClearSlot(index)}
                              title="Gỡ bỏ"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ) : (
                          <div className="slot-placeholder">
                            <span className="plus-sign">+</span>
                            <span>Trống</span>
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
              disabled={activeTeam.length === 0}
              style={{ opacity: activeTeam.length === 0 ? 0.5 : 1 }}
            >
              Lưu Đội Hình Cho Profile
            </button>
          </div>

          {/* Roster selection */}
          <div className="roster-selector glass">
            <h3 className="section-title">Chọn nhân vật để thêm/bớt vào đội hình</h3>
            <div className="roster-grid">
              {CHARACTERS.map((char) => {
                const isSelected = activeTeam.includes(char.id);
                return (
                  <div
                    key={char.id}
                    className={`roster-item glass ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleSelectCharacter(char.id)}
                    style={{ '--char-accent': char.accentColor }}
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

        {/* Right column: Stats analysis & Synergies */}
        <div className="builder-right">
          {/* Average stats */}
          <div className="analytics-card glass">
            <h3 className="section-title">Chỉ Số Trung Bình (Sĩ Số)</h3>
            {activeTeam.length > 0 ? (
              <div className="avg-stats-list">
                <div className="avg-stat-item">
                  <span className="avg-stat-label">SENSE</span>
                  <span className="avg-stat-val text-purple">{avgStats.sense}</span>
                  <div className="avg-bar-bg"><div className="avg-bar-fill bg-purple" style={{ width: `${avgStats.sense}%` }} /></div>
                </div>
                <div className="avg-stat-item">
                  <span className="avg-stat-label">TECH</span>
                  <span className="avg-stat-val text-blue">{avgStats.technique}</span>
                  <div className="avg-bar-bg"><div className="avg-bar-fill bg-blue" style={{ width: `${avgStats.technique}%` }} /></div>
                </div>
                <div className="avg-stat-item">
                  <span className="avg-stat-label">PERF</span>
                  <span className="avg-stat-val text-red">{avgStats.performance}</span>
                  <div className="avg-bar-bg"><div className="avg-bar-fill bg-red" style={{ width: `${avgStats.performance}%` }} /></div>
                </div>
                <div className="avg-stat-item">
                  <span className="avg-stat-label">SUPP</span>
                  <span className="avg-stat-val text-green">{avgStats.support}</span>
                  <div className="avg-bar-bg"><div className="avg-bar-fill bg-green" style={{ width: `${avgStats.support}%` }} /></div>
                </div>
              </div>
            ) : (
              <div className="empty-analytics">
                <AlertCircle size={24} className="text-muted" />
                <p>Hãy thêm thành viên vào đội hình để xem phân tích chỉ số</p>
              </div>
            )}
          </div>

          {/* Active Synergies list */}
          <div className="synergy-card glass">
            <h3 className="section-title">Cộng Hưởng Kích Hoạt</h3>
            {activeSynergies.length > 0 ? (
              <div className="synergies-list">
                {activeSynergies.map((syn, idx) => (
                  <div key={idx} className="synergy-bonus-item glass border-gold">
                    <div className="synergy-header">
                      <span className="synergy-badge-title">{syn.bonus}</span>
                      <span className="synergy-partners">{syn.charName} + {syn.partnerName}</span>
                    </div>
                    <p className="synergy-desc">{syn.desc}</p>
                  </div>
                ))}
                <div className="synergy-success">
                  <CheckCircle2 size={16} className="text-green" />
                  <span>Kích hoạt thành công {activeSynergies.length} hiệu ứng!</span>
                </div>
              </div>
            ) : (
              <div className="empty-analytics">
                {selectedChars.length >= 2 ? (
                  <>
                    <ShieldAlert size={24} className="text-orange" />
                    <p>Đội hình hiện tại không có hiệu ứng cộng hưởng phù hợp. Hãy thử đổi nhân vật khác!</p>
                  </>
                ) : (
                  <>
                    <AlertCircle size={24} className="text-muted" />
                    <p>Cần ít nhất 2 nhân vật để bắt đầu tính cộng hưởng đội hình</p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
