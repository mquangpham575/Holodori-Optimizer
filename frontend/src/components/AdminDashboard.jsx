import React, { useState } from 'react';
import { Lock, Plus, Edit2, Trash2, X, FileText, Sparkles, Key, Check } from 'lucide-react';
import './AdminDashboard.css';
import { CHARACTERS } from '../data';

export default function AdminDashboard({ characters = [], setCharacters, guides = [], setGuides, API_BASE }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [password, setPassword] = useState('');
  const [activeTab, setActiveTab] = useState('characters');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Character Form Modal State
  const [charModalOpen, setCharModalOpen] = useState(false);
  const [editingChar, setEditingChar] = useState(null);
  const [charForm, setCharForm] = useState({
    id: '', name: '', title: '', rarity: '5-Star', group: 'Gen 0', type: 'PURE',
    accentColor: '#3a86ff', image: '', avatar: '',
    stats: { sense: 80, technique: 80, performance: 80, support: 80 },
    skills: { outfit: '', special: '', active: '', passive: '' }
  });

  // Guide Form Modal State
  const [guideModalOpen, setGuideModalOpen] = useState(false);
  const [editingGuide, setEditingGuide] = useState(null);
  const [syncOptions, setSyncOptions] = useState({ skills: true, stats: false, bio: false });
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [syncSuccess, setSyncSuccess] = useState('');
  const [selectedCharIds, setSelectedCharIds] = useState([]);
  const [guideForm, setGuideForm] = useState({
    id: '', title: '', summary: '', category: 'General', readTime: '5 min read',
    author: 'Admin', date: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    content: ''
  });

  // Handle local image file upload and preview
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (uploadEvent) => {
      const base64Data = uploadEvent.target.result;
      try {
        const res = await fetch(`${API_BASE}/api/admin/upload`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-password': password
          },
          body: JSON.stringify({
            fileName: file.name,
            base64Data
          })
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Upload failed');
        }

        setCharForm(prev => ({ ...prev, image: data.url }));
        showNotification('Image uploaded and previewed successfully!');
      } catch (err) {
        showNotification(err.message, 'error');
      }
    };
    reader.readAsDataURL(file);
  };

  // Handle pasting images directly from clipboard inside guide markdown editor
  const handleContentPaste = async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    let imageItem = null;
    for (const item of items) {
      if (item.type.indexOf('image') !== -1) {
        imageItem = item;
        break;
      }
    }

    if (imageItem) {
      e.preventDefault();
      const file = imageItem.getAsFile();
      if (!file) return;

      showNotification('Uploading image from clipboard...', 'success');

      const reader = new FileReader();
      reader.onload = async (uploadEvent) => {
        const base64Data = uploadEvent.target.result;
        try {
          const res = await fetch(`${API_BASE}/api/admin/upload`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-admin-password': password
            },
            body: JSON.stringify({
              fileName: file.name || 'clipboard.png',
              base64Data
            })
          });

          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error || 'Upload failed');
          }

          const textarea = e.target;
          const start = textarea.selectionStart;
          const end = textarea.selectionEnd;
          const text = textarea.value;
          const imageMarkdown = `\n![Pasted Image](${data.url})\n`;
          const newContent = text.substring(0, start) + imageMarkdown + text.substring(end);

          setGuideForm(prev => ({ ...prev, content: newContent }));

          // Refocus and place cursor after inserted markdown
          setTimeout(() => {
            textarea.focus();
            textarea.selectionStart = textarea.selectionEnd = start + imageMarkdown.length;
          }, 0);

          showNotification('Clipboard image pasted and uploaded successfully!');
        } catch (err) {
          showNotification(err.message, 'error');
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Password Unlock Check
  const handleLogin = (e) => {
    e.preventDefault();
    // Use the password locally, we will verify it on endpoint requests
    if (password.trim() === '') {
      setError('Password cannot be empty');
      return;
    }
    setIsAdmin(true);
    setError('');
  };

  const showNotification = (msg, type = 'success') => {
    if (type === 'success') {
      setSuccess(msg);
      setTimeout(() => setSuccess(''), 3000);
    } else {
      setError(msg);
      setTimeout(() => setError(''), 3000);
    }
  };

  // Open Modal for Character
  const openCharModal = (char = null) => {
    if (char) {
      setEditingChar(char);
      setCharForm({ ...char });
    } else {
      setEditingChar(null);
      setCharForm({
        id: '', name: '', title: '', rarity: '5-Star', group: 'Gen 0', type: 'PURE',
        accentColor: '#3a86ff', image: '', avatar: '',
        stats: { sense: 80, technique: 80, performance: 80, support: 80 },
        skills: { outfit: '', special: '', active: '', passive: '' }
      });
    }
    setCharModalOpen(true);
  };

  // Save Character (Add or Edit)
  const handleSaveCharacter = async (e) => {
    e.preventDefault();
    const isEditing = !!editingChar;
    const url = isEditing 
      ? `${API_BASE}/api/admin/characters/${editingChar.id}`
      : `${API_BASE}/api/admin/characters`;
    const method = isEditing ? 'PUT' : 'POST';

    const senseVal = parseInt(charForm.stats.sense) || 0;
    const techVal = parseInt(charForm.stats.technique) || 0;
    const perfVal = parseInt(charForm.stats.performance) || 0;
    const calculatedTotal = senseVal + techVal + perfVal;

    const finalForm = {
      ...charForm,
      stats: {
        sense: senseVal,
        technique: techVal,
        performance: perfVal,
        total: calculatedTotal
      }
    };

    try {
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': password
        },
        body: JSON.stringify(finalForm)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Server error occurred');
      }

      if (isEditing) {
        setCharacters(prev => prev.map(c => c.id === editingChar.id ? finalForm : c));
        showNotification('Character updated successfully!');
      } else {
        setCharacters(prev => [...prev, finalForm]);
        showNotification('Character added successfully!');
      }
      setCharModalOpen(false);
    } catch (err) {
      showNotification(err.message, 'error');
    }
  };

  // Delete Character
  const handleDeleteCharacter = async (charId) => {
    if (!window.confirm('Are you sure you want to delete this character card?')) return;

    try {
      const res = await fetch(`${API_BASE}/api/admin/characters/${charId}`, {
        method: 'DELETE',
        headers: {
          'x-admin-password': password
        }
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Server error occurred');
      }

      setCharacters(prev => prev.filter(c => c.id !== charId));
      showNotification('Character card deleted successfully!');
    } catch (err) {
      showNotification(err.message, 'error');
    }
  };

  // Open Modal for Guide
  const handlePerformSync = async () => {
    setIsSyncing(true);
    setSyncError('');
    setSyncSuccess('');
    try {
      const res = await fetch(`${API_BASE}/api/admin/sync-from-file`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': password
        },
        body: JSON.stringify({ ...syncOptions, charIds: selectedCharIds })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to sync database');
      }
      if (data.characters) {
        const sorted = [...data.characters];
        const originalOrder = CHARACTERS.map(c => c.id);
        sorted.sort((a, b) => {
          const idxA = originalOrder.indexOf(a.id);
          const idxB = originalOrder.indexOf(b.id);
          if (idxA === -1 && idxB === -1) return 0;
          if (idxA === -1) return 1;
          if (idxB === -1) return -1;
          return idxA - idxB;
        });
        setCharacters(sorted);
      }
      setSyncSuccess('Database synchronized successfully!');
      setTimeout(() => setSyncSuccess(''), 4000);
    } catch (err) {
      setSyncError(err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const openGuideModal = (guide = null) => {
    if (guide) {
      setEditingGuide(guide);
      setGuideForm({ ...guide });
    } else {
      setEditingGuide(null);
      setGuideForm({
        id: '', title: '', summary: '', category: 'General', readTime: '5 min read',
        author: 'Admin', date: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
        content: ''
      });
    }
    setGuideModalOpen(true);
  };

  // Save Guide (Add or Edit)
  const handleSaveGuide = async (e) => {
    e.preventDefault();
    const isEditing = !!editingGuide;
    const url = isEditing 
      ? `${API_BASE}/api/admin/guides/${editingGuide.id}`
      : `${API_BASE}/api/admin/guides`;
    const method = isEditing ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': password
        },
        body: JSON.stringify(guideForm)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Server error occurred');
      }

      if (isEditing) {
        setGuides(prev => prev.map(g => g.id === editingGuide.id ? guideForm : g));
        showNotification('Guide article updated successfully!');
      } else {
        setGuides(prev => [...prev, guideForm]);
        showNotification('Guide article added successfully!');
      }
      setGuideModalOpen(false);
    } catch (err) {
      showNotification(err.message, 'error');
    }
  };

  // Delete Guide
  const handleDeleteGuide = async (guideId) => {
    if (!window.confirm('Are you sure you want to delete this guide article?')) return;

    try {
      const res = await fetch(`${API_BASE}/api/admin/guides/${guideId}`, {
        method: 'DELETE',
        headers: {
          'x-admin-password': password
        }
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Server error occurred');
      }

      setGuides(prev => prev.filter(g => g.id !== guideId));
      showNotification('Guide article deleted successfully!');
    } catch (err) {
      showNotification(err.message, 'error');
    }
  };

  // Login Protection Gate
  if (!isAdmin) {
    return (
      <div className="admin-login-page animate-fade-in">
        <div className="login-card glass">
          <div className="login-icon-wrapper">
            <Lock size={32} />
          </div>
          <h2>Admin Administration</h2>
          <p className="login-desc">Enter the owner master password to unlock the talent database and website configurations.</p>
          
          <form onSubmit={handleLogin}>
            <div className="input-group">
              <label htmlFor="password">Owner Password</label>
              <div className="password-input-wrapper">
                <Key size={16} className="pass-icon" />
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter administrator password..."
                  className="glass"
                />
              </div>
            </div>
            {error && <div className="login-error">{error}</div>}
            <button type="submit" className="btn-login-submit">
              Unlock Portal
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-dashboard-page animate-fade-in">
      {/* Dynamic Toast Alerts */}
      {success && <div className="admin-toast toast-success glass"><Check size={16} /> <span>{success}</span></div>}
      {error && <div className="admin-toast toast-error glass"><X size={16} /> <span>{error}</span></div>}

      {/* Tabs Switcher */}
      <div className="admin-tabs-bar glass">
        <button 
          className={`admin-tab-btn ${activeTab === 'characters' ? 'active' : ''}`}
          onClick={() => setActiveTab('characters')}
        >
          <Sparkles size={16} /> Manage Characters ({characters.length})
        </button>
        <button 
          className={`admin-tab-btn ${activeTab === 'guides' ? 'active' : ''}`}
          onClick={() => setActiveTab('guides')}
        >
          <FileText size={16} /> Manage Guides ({guides.length})
        </button>
        <button 
          className={`admin-tab-btn ${activeTab === 'sync' ? 'active' : ''}`}
          onClick={() => setActiveTab('sync')}
        >
          <Key size={16} /> Selective Sync
        </button>
      </div>

      {/* Characters Management Tab */}
      {activeTab === 'characters' && (
        <div className="admin-tab-content glass">
          <div className="admin-actions-row">
            <h3>Talent Cards Inventory</h3>
            <button className="btn-add-item" onClick={() => openCharModal(null)}>
              <Plus size={16} /> Add VTuber Card
            </button>
          </div>

          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>VTuber</th>
                  <th>Title / Rarity</th>
                  <th>Group / Type</th>
                  <th>Accent Color</th>
                  <th>Stats (P/T/S/T)</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {characters.map(char => (
                  <tr key={char.id}>
                    <td className="td-char-profile">
                      <div className="td-avatar" style={{ border: `1.5px solid ${char.accentColor}`, boxShadow: `0 0 8px ${char.accentColor}30` }}>
                        {char.image ? <img src={char.image} alt={char.name} /> : char.avatar}
                      </div>
                      <div>
                        <span className="td-name">{char.name}</span>
                        <span className="td-id">id: {char.id}</span>
                      </div>
                    </td>
                    <td>
                      <span className="td-title-text">{char.title}</span>
                      <span className="td-rarity">{char.rarity}</span>
                    </td>
                    <td>
                      <span className="td-group">{char.group}</span>
                      <span className={`td-type type-${char.type.toLowerCase()}`}>{char.type}</span>
                    </td>
                    <td>
                      <div className="color-preview-block">
                        <span className="color-dot" style={{ background: char.accentColor }}></span>
                        <code>{char.accentColor}</code>
                      </div>
                    </td>
                    <td>
                      <code className="td-stats-list">
                        P: {char.stats.performance} / T: {char.stats.technique} / S: {char.stats.sense} (Total: {char.stats.total || ((parseInt(char.stats.sense) || 0) + (parseInt(char.stats.technique) || 0) + (parseInt(char.stats.performance) || 0))})
                      </code>
                    </td>
                    <td>
                      <div className="actions-cell">
                        <button className="icon-action-btn edit" onClick={() => openCharModal(char)}>
                          <Edit2 size={13} />
                        </button>
                        <button className="icon-action-btn delete" onClick={() => handleDeleteCharacter(char.id)}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Guides Management Tab */}
      {activeTab === 'guides' && (
        <div className="admin-tab-content glass">
          <div className="admin-actions-row">
            <h3>Guides & Articles Directory</h3>
            <button className="btn-add-item" onClick={() => openGuideModal(null)}>
              <Plus size={16} /> Write Guide Article
            </button>
          </div>

          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Article</th>
                  <th>Category</th>
                  <th>Author</th>
                  <th>Read Time</th>
                  <th>Publish Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {guides.map(guide => (
                  <tr key={guide.id}>
                    <td>
                      <span className="td-name">{guide.title}</span>
                      <span className="td-id">id: {guide.id}</span>
                    </td>
                    <td><span className="td-group">{guide.category}</span></td>
                    <td><span className="td-title-text">{guide.author}</span></td>
                    <td><span className="td-rarity">{guide.readTime}</span></td>
                    <td><span className="td-date">{guide.date}</span></td>
                    <td>
                      <div className="actions-cell">
                        <button className="icon-action-btn edit" onClick={() => openGuideModal(guide)}>
                          <Edit2 size={13} />
                        </button>
                        <button className="icon-action-btn delete" onClick={() => handleDeleteGuide(guide.id)}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Selective Sync Tab */}
      {activeTab === 'sync' && (
        <div className="admin-tab-content glass" style={{ padding: '2.5rem 2rem' }}>
          <div className="db-sync-container" style={{ maxWidth: '600px', margin: '0 auto' }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '0.8rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Key className="text-gold" size={24} />
              Selective Database Sync
            </h2>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: '1.6', marginBottom: '2rem' }}>
              Synchronize character definitions from the static <code>data.js</code> codebase file directly into your cloud/local database. Select which specific properties you want to overwrite. All other unselected parameters will remain completely untouched.
            </p>

            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1.5rem', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '2rem' }}>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '1.25rem', color: 'var(--text-primary)' }}>Select Properties to Overwrite</h4>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer', userSelect: 'none' }}>
                  <input 
                    type="checkbox" 
                    checked={syncOptions.skills} 
                    onChange={(e) => setSyncOptions(prev => ({ ...prev, skills: e.target.checked }))}
                    style={{ width: '17px', height: '17px', accentColor: 'var(--accent-color)', marginTop: '2px' }}
                  />
                  <div>
                    <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>Skills Only</strong>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>Outfit, Special, Active, and Passive skills descriptions</div>
                  </div>
                </label>

                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer', userSelect: 'none' }}>
                  <input 
                    type="checkbox" 
                    checked={syncOptions.stats} 
                    onChange={(e) => setSyncOptions(prev => ({ ...prev, stats: e.target.checked }))}
                    style={{ width: '17px', height: '17px', accentColor: 'var(--accent-color)', marginTop: '2px' }}
                  />
                  <div>
                    <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>Stats Only</strong>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>Sense, Technique, Performance, and Total stats</div>
                  </div>
                </label>

                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer', userSelect: 'none' }}>
                  <input 
                    type="checkbox" 
                    checked={syncOptions.bio} 
                    onChange={(e) => setSyncOptions(prev => ({ ...prev, bio: e.target.checked }))}
                    style={{ width: '17px', height: '17px', accentColor: 'var(--accent-color)', marginTop: '2px' }}
                  />
                  <div>
                    <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>Profile Bio Only</strong>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>Name, Title, Rarity, Group, Type, Accent Color, Image path, and Avatar text</div>
                  </div>
                </label>
              </div>

              {/* Character selection grid for targeted sync */}
              <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem' }}>
                <label style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '0.75rem' }}>
                  Select Characters to Sync (Optional - leave empty to sync all)
                </label>
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', 
                  gap: '8px', 
                  maxHeight: '180px', 
                  overflowY: 'auto', 
                  background: 'rgba(0,0,0,0.15)', 
                  padding: '10px', 
                  borderRadius: '6px', 
                  border: '1px solid var(--border-color)' 
                }}>
                  {characters.map(char => {
                    const isSelected = selectedCharIds.includes(char.id);
                    return (
                      <div 
                        key={char.id}
                        onClick={() => {
                          if (isSelected) {
                            setSelectedCharIds(prev => prev.filter(id => id !== char.id));
                          } else {
                            setSelectedCharIds(prev => [...prev, char.id]);
                          }
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '6px 8px',
                          borderRadius: '4px',
                          background: isSelected ? 'var(--accent-glow)' : 'transparent',
                          border: `1px solid ${isSelected ? 'var(--accent-color)' : 'rgba(255,255,255,0.03)'}`,
                          cursor: 'pointer',
                          fontSize: '0.8rem',
                          transition: 'all 0.15s ease',
                          userSelect: 'none'
                        }}
                      >
                        <div style={{ 
                          width: '20px', 
                          height: '20px', 
                          borderRadius: '50%', 
                          overflow: 'hidden', 
                          border: `1px solid ${char.accentColor}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: 'rgba(0,0,0,0.3)',
                          flexShrink: 0
                        }}>
                          {char.image ? <img src={char.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : char.avatar}
                        </div>
                        <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                          {char.name}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {selectedCharIds.length > 0 && (
                  <div style={{ marginTop: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Selected: {selectedCharIds.length} VTubers</span>
                    <button 
                      onClick={() => setSelectedCharIds([])}
                      style={{ background: 'transparent', border: 'none', color: 'var(--accent-color)', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600, padding: 0 }}
                    >
                      Clear Selection
                    </button>
                  </div>
                )}
              </div>
            </div>

            {syncError && (
              <div className="login-error" style={{ marginBottom: '1.5rem', padding: '0.75rem', borderRadius: '6px', fontSize: '0.85rem' }}>
                {syncError}
              </div>
            )}
            {syncSuccess && (
              <div style={{ color: '#10b981', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', padding: '0.75rem', borderRadius: '6px', fontSize: '0.85rem', marginBottom: '1.5rem', fontWeight: 600 }}>
                {syncSuccess}
              </div>
            )}

            <button 
              onClick={handlePerformSync} 
              disabled={isSyncing || (!syncOptions.skills && !syncOptions.stats && !syncOptions.bio)}
              style={{
                width: '100%',
                padding: '0.85rem',
                borderRadius: '6px',
                background: 'var(--accent-color)',
                color: 'white',
                border: 'none',
                fontWeight: 700,
                fontSize: '0.95rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                opacity: (isSyncing || (!syncOptions.skills && !syncOptions.stats && !syncOptions.bio)) ? 0.5 : 1,
                transition: 'all 0.2s ease-in-out'
              }}
            >
              {isSyncing ? 'Synchronizing cloud database...' : 'Perform Database Sync'}
            </button>
          </div>
        </div>
      )}

      {/* Character Form Modal */}
      {charModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content glass admin-modal wide">
            <div className="modal-header">
              <h2>{editingChar ? 'Edit VTuber Card' : 'Add New VTuber'}</h2>
              <button className="modal-close" onClick={() => setCharModalOpen(false)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveCharacter} className="admin-form">
              <div className="form-grid">
                {/* Left side inputs */}
                <div className="form-column">
                  <div className="input-group">
                    <label>Unique ID (Lowercase, no spaces)</label>
                    <input
                      type="text"
                      required
                      disabled={!!editingChar}
                      value={charForm.id}
                      onChange={(e) => setCharForm({ ...charForm, id: e.target.value })}
                      placeholder="e.g. usadapekora"
                    />
                  </div>

                  <div className="input-group">
                    <label>Display Name</label>
                    <input
                      type="text"
                      required
                      value={charForm.name}
                      onChange={(e) => setCharForm({ ...charForm, name: e.target.value })}
                      placeholder="e.g. Usada Pekora"
                    />
                  </div>

                  <div className="input-group">
                    <label>Card Title (Wiki source)</label>
                    <input
                      type="text"
                      required
                      value={charForm.title}
                      onChange={(e) => setCharForm({ ...charForm, title: e.target.value })}
                      placeholder="e.g. Stellar Concert"
                    />
                  </div>

                  <div className="form-row">
                    <div className="input-group half">
                      <label>Group</label>
                      <input
                        type="text"
                        required
                        value={charForm.group}
                        onChange={(e) => setCharForm({ ...charForm, group: e.target.value })}
                        placeholder="e.g. Gen 3"
                      />
                    </div>
                    <div className="input-group half">
                      <label>Type</label>
                      <select
                        value={charForm.type}
                        onChange={(e) => setCharForm({ ...charForm, type: e.target.value })}
                      >
                        <option value="PURE">PURE</option>
                        <option value="CUTE">CUTE</option>
                        <option value="HAPPY">HAPPY</option>
                      </select>
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="input-group half">
                      <label>Signature Hex Color</label>
                      <input
                        type="text"
                        required
                        value={charForm.accentColor}
                        onChange={(e) => setCharForm({ ...charForm, accentColor: e.target.value })}
                        placeholder="e.g. #ff85a2"
                      />
                    </div>
                    <div className="input-group half">
                      <label>Fallback Avatar Initial</label>
                      <input
                        type="text"
                        maxLength="2"
                        required
                        value={charForm.avatar}
                        onChange={(e) => setCharForm({ ...charForm, avatar: e.target.value })}
                        placeholder="e.g. P"
                      />
                    </div>
                  </div>

                  <div className="input-group">
                    <label>Card Image (Upload File or Enter URL)</label>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '8px' }}>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileChange}
                        style={{ padding: '6px' }}
                      />
                      {charForm.image && (
                        <div style={{ position: 'relative', width: '48px', height: '48px', borderRadius: '6px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.2)' }}>
                          <img src={charForm.image} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                      )}
                    </div>
                    <input
                      type="text"
                      value={charForm.image}
                      onChange={(e) => setCharForm({ ...charForm, image: e.target.value })}
                      placeholder="e.g. /images/usadapekora.webp"
                    />
                  </div>

                  <div className="stats-inputs-block">
                    <h4>Max Stats Values</h4>
                    <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                      {[
                        { key: 'performance', label: 'PERF' },
                        { key: 'technique', label: 'TECH' },
                        { key: 'sense', label: 'SENSE' }
                      ].map((item) => (
                        <div key={item.key} className="input-group stat-col">
                          <label>{item.label}</label>
                          <input
                            type="number"
                            min="1"
                            max="999999"
                            required
                            value={charForm.stats[item.key]}
                            onChange={(e) => setCharForm({
                              ...charForm,
                              stats: { ...charForm.stats, [item.key]: parseInt(e.target.value) || 8000 }
                            })}
                          />
                        </div>
                      ))}
                      <div className="input-group stat-col">
                        <label>TOTAL</label>
                        <input
                          type="number"
                          disabled
                          value={(parseInt(charForm.stats.sense) || 0) + (parseInt(charForm.stats.technique) || 0) + (parseInt(charForm.stats.performance) || 0)}
                          style={{ background: 'rgba(255,255,255,0.05)', color: '#ffb703', fontWeight: 'bold' }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right side inputs: Skill descriptions */}
                <div className="form-column">
                  <div className="input-group">
                    <label>Outfit Skill description</label>
                    <textarea
                      rows="3"
                      value={charForm.skills.outfit}
                      onChange={(e) => setCharForm({
                        ...charForm,
                        skills: { ...charForm.skills, outfit: e.target.value }
                      })}
                      placeholder="e.g. With 2 or more Gen 3 members, grants support UP..."
                    ></textarea>
                  </div>

                  <div className="input-group">
                    <label>Special Skill description</label>
                    <textarea
                      rows="3"
                      value={charForm.skills.special}
                      onChange={(e) => setCharForm({
                        ...charForm,
                        skills: { ...charForm.skills, special: e.target.value }
                      })}
                      placeholder="e.g. Grants score support effect of 150%..."
                    ></textarea>
                  </div>

                  <div className="input-group">
                    <label>Active Skill description</label>
                    <textarea
                      rows="3"
                      value={charForm.skills.active}
                      onChange={(e) => setCharForm({
                        ...charForm,
                        skills: { ...charForm.skills, active: e.target.value }
                      })}
                      placeholder="e.g. Every 18s with high probability..."
                    ></textarea>
                  </div>

                  <div className="input-group">
                    <label>Passive Skill description</label>
                    <textarea
                      rows="3"
                      value={charForm.skills.passive}
                      onChange={(e) => setCharForm({
                        ...charForm,
                        skills: { ...charForm.skills, passive: e.target.value }
                      })}
                      placeholder="e.g. Grants Technique UP of 20% to self..."
                    ></textarea>
                  </div>
                </div>
              </div>

              <div className="form-actions">
                <button type="button" className="btn-cancel" onClick={() => setCharModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-submit">
                  Save Card
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Guide Form Modal */}
      {guideModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content glass admin-modal wide">
            <div className="modal-header">
              <h2>{editingGuide ? 'Edit Guide Article' : 'Write Guide Article'}</h2>
              <button className="modal-close" onClick={() => setGuideModalOpen(false)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveGuide} className="admin-form">
              <div className="form-row">
                <div className="input-group third">
                  <label>Article ID (URL name)</label>
                  <input
                    type="text"
                    required
                    disabled={!!editingGuide}
                    value={guideForm.id}
                    onChange={(e) => setGuideForm({ ...guideForm, id: e.target.value })}
                    placeholder="e.g. meta-analysis-aug"
                  />
                </div>
                <div className="input-group third">
                  <label>Category</label>
                  <select
                    value={guideForm.category}
                    onChange={(e) => setGuideForm({ ...guideForm, category: e.target.value })}
                  >
                    <option value="General">General</option>
                    <option value="Builds">Builds</option>
                    <option value="Meta">Meta</option>
                  </select>
                </div>
                <div className="input-group third">
                  <label>Estimated Read Time</label>
                  <input
                    type="text"
                    required
                    value={guideForm.readTime}
                    onChange={(e) => setGuideForm({ ...guideForm, readTime: e.target.value })}
                    placeholder="e.g. 5 min read"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="input-group half">
                  <label>Title</label>
                  <input
                    type="text"
                    required
                    value={guideForm.title}
                    onChange={(e) => setGuideForm({ ...guideForm, title: e.target.value })}
                    placeholder="Enter article title..."
                  />
                </div>
                <div className="input-group half">
                  <label>Author / Date</label>
                  <div className="form-row">
                    <input
                      type="text"
                      required
                      value={guideForm.author}
                      onChange={(e) => setGuideForm({ ...guideForm, author: e.target.value })}
                      placeholder="Author name..."
                      style={{ marginRight: '10px' }}
                    />
                    <input
                      type="text"
                      required
                      value={guideForm.date}
                      onChange={(e) => setGuideForm({ ...guideForm, date: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="input-group">
                <label>Summary / Subtitle (Short excerpt)</label>
                <input
                  type="text"
                  required
                  value={guideForm.summary}
                  onChange={(e) => setGuideForm({ ...guideForm, summary: e.target.value })}
                  placeholder="Enter a brief summary..."
                />
              </div>

              <div className="input-group">
                <label>Markdown Article Body Content</label>
                <textarea
                  rows="14"
                  required
                  value={guideForm.content}
                  onChange={(e) => setGuideForm({ ...guideForm, content: e.target.value })}
                  onPaste={handleContentPaste}
                  placeholder="# Article Heading&#10;&#10;Write markdown content here..."
                  className="content-textarea"
                ></textarea>
              </div>

              <div className="form-actions">
                <button type="button" className="btn-cancel" onClick={() => setGuideModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-submit">
                  Save Article
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
