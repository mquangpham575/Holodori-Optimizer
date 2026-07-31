import { NavLink, useNavigate } from 'react-router-dom';
import { Home, Users, Layers, BookOpen, Sparkles, Sun, Moon, ChevronDown, ExternalLink, Globe } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';
import './Navbar.css';

/**
 * Navbar - Premium navigation header for the application.
 */
export default function Navbar({ API_BASE = '' }) {
  const navigate = useNavigate();
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [isLangOpen, setIsLangOpen] = useState(false);
  const { currentLang, setLang, t, languages } = useLanguage();
  const [isLightMode, setIsLightMode] = useState(() => {
    return localStorage.getItem('theme_mode') === 'light';
  });

  // Sync Light Mode class to body
  useEffect(() => {
    if (isLightMode) {
      document.body.classList.add('theme-light');
      localStorage.setItem('theme_mode', 'light');
    } else {
      document.body.classList.remove('theme-light');
      localStorage.setItem('theme_mode', 'dark');
    }
  }, [isLightMode]);

  // Click outside to close status and language dropdowns
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (!e.target.closest('.status-menu-container')) {
        setIsStatusOpen(false);
      }
      if (!e.target.closest('.lang-menu-container')) {
        setIsLangOpen(false);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, []);

  const [healthStatus, setHealthStatus] = useState({
    status: 'checking',
    services: {
      backend: 'checking',
      postgres: 'checking'
    }
  });

  // Fetch real-time health checks
  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/health`);
        if (!res.ok) throw new Error("API unhealthy");
        const data = await res.json();
        setHealthStatus(data);
      } catch (err) {
        console.error("Health check error:", err);
        setHealthStatus({
          status: 'offline',
          services: {
            backend: 'offline',
            postgres: 'offline'
          }
        });
      }
    };

    fetchHealth();
    const interval = setInterval(fetchHealth, 30000); // Check every 30s
    return () => clearInterval(interval);
  }, [API_BASE]);

  // Color helper for dots
  const getStatusColor = (val) => {
    if (val === 'operational' || val === 'local_file_db') return '#10b981'; // Green
    if (val === 'checking') return '#f59e0b'; // Orange
    return '#ef4444'; // Red
  };

  // Status banner display text key and color
  const getBannerInfo = () => {
    if (healthStatus.status === 'operational') {
      return { textKey: 'systems_operational', color: '#10b981' };
    }
    if (healthStatus.status === 'checking') {
      return { textKey: 'checking_status', color: '#f59e0b' };
    }
    if (healthStatus.status === 'degraded') {
      return { textKey: 'systems_degraded', color: '#f59e0b' };
    }
    return { textKey: 'systems_offline', color: '#ef4444' };
  };

  const banner = getBannerInfo();
  const STATUS_PAGE_URL = import.meta.env.VITE_STATUS_PAGE_URL || 'https://status.hololive-dream.vercel.app';

  const navItems = [
    { path: '/home', labelKey: 'home', icon: Home },
    { path: '/characters', labelKey: 'characters', icon: Users },
    { path: '/builder', labelKey: 'builder', icon: Layers },
    { path: '/guides', labelKey: 'guides', icon: BookOpen }
  ];

  return (
    <header className="navbar glass">
      <div className="nav-container">
        <div className="brand" onClick={() => navigate('/home')}>
          <Sparkles className="brand-icon" />
          <span className="brand-title">HoloDreams <span className="title-glow">Showcase</span></span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1.75rem' }}>
          <nav className="nav-links">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                >
                  {({ isActive }) => (
                    <>
                      <Icon size={18} className="nav-icon" />
                      <span className="nav-label">{t(item.labelKey)}</span>
                      {isActive && <span className="active-indicator" />}
                    </>
                  )}
                </NavLink>
              );
            })}
          </nav>

          {/* Actions Container */}
          <div className="nav-actions" style={{ display: 'flex', alignItems: 'center', gap: '1.15rem' }}>
            {/* Language Selector Dropdown */}
            <div className="lang-menu-container" style={{ position: 'relative' }}>
              <button
                onClick={() => setIsLangOpen(!isLangOpen)}
                className="status-btn"
                style={{
                  background: 'rgba(0, 0, 0, 0.15)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  padding: '6px 12px',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.2s'
                }}
              >
                <Globe size={14} style={{ color: 'var(--text-secondary)' }} />
                <span className="nav-action-btn-text">{languages.find(l => l.code === currentLang)?.label || 'English'}</span>
                <ChevronDown size={11} style={{ transition: 'transform 0.2s', transform: isLangOpen ? 'rotate(180deg)' : 'none' }} />
              </button>

              {isLangOpen && (
                <div
                  className="status-dropdown-panel glass animate-scale-up"
                  style={{
                    position: 'absolute',
                    top: '40px',
                    right: 0,
                    width: '180px',
                    borderRadius: '12px',
                    padding: '0.5rem',
                    zIndex: 1000,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-card)',
                    backdropFilter: 'blur(16px)',
                    maxHeight: '320px',
                    overflowY: 'auto'
                  }}
                >
                  {languages.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => {
                        setLang(lang.code);
                        setIsLangOpen(false);
                      }}
                      style={{
                        background: currentLang === lang.code ? 'rgba(255, 183, 3, 0.15)' : 'transparent',
                        border: 'none',
                        color: currentLang === lang.code ? '#ffb703' : 'var(--text-primary)',
                        fontFamily: 'var(--font-body)',
                        fontSize: '0.82rem',
                        fontWeight: currentLang === lang.code ? 700 : 500,
                        padding: '8px 12px',
                        borderRadius: '6px',
                        textAlign: 'left',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        if (currentLang !== lang.code) {
                          e.target.style.background = 'rgba(255, 255, 255, 0.05)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (currentLang !== lang.code) {
                          e.target.style.background = 'transparent';
                        }
                      }}
                    >
                      {lang.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Theme Toggle Button */}
            <button 
              onClick={() => setIsLightMode(!isLightMode)} 
              className="theme-toggle-btn"
              title={isLightMode ? "Switch to Dark Mode" : "Switch to Light Mode"}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0.35rem',
                borderRadius: '50%',
                transition: 'color 0.2s, background 0.2s',
                width: '34px',
                height: '34px'
              }}
              onMouseEnter={(e) => e.target.style.background = 'rgba(255, 255, 255, 0.05)'}
              onMouseLeave={(e) => e.target.style.background = 'transparent'}
            >
              {isLightMode ? <Moon size={19} /> : <Sun size={19} />}
            </button>

            {/* Status Dropdown Box */}
            <div className="status-menu-container" style={{ position: 'relative' }}>
              <button 
                onClick={() => setIsStatusOpen(!isStatusOpen)}
                className="status-btn"
                style={{
                  background: 'rgba(0, 0, 0, 0.15)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  padding: '6px 12px',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'all 0.2s'
                }}
              >
                <span style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: banner.color,
                  boxShadow: `0 0 6px ${banner.color}`
                }} />
                <span className="nav-action-btn-text">{t('status')}</span>
                <ChevronDown size={12} style={{ transition: 'transform 0.2s', transform: isStatusOpen ? 'rotate(180deg)' : 'none' }} />
              </button>

              {isStatusOpen && (
                <div 
                  className="status-dropdown-panel glass animate-scale-up"
                  style={{
                    position: 'absolute',
                    top: '40px',
                    right: 0,
                    width: '280px',
                    borderRadius: '12px',
                    padding: '1rem',
                    zIndex: 1000,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-card)',
                    backdropFilter: 'blur(16px)'
                  }}
                >
                  {/* Dropdown Header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '0.65rem', borderBottom: '1px solid var(--border-color)' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: banner.color, boxShadow: `0 0 6px ${banner.color}` }} />
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: banner.color, letterSpacing: '0.2px' }}>{t(banner.textKey)}</span>
                  </div>
                  
                  {/* Services List */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', padding: '0.15rem 0' }}>
                    {[
                      { name: 'Frontend', cat: 'Frontend', val: 'operational' },
                      { name: 'Backend (API)', cat: 'Backend', key: 'backend', link: '/api/docs' },
                      { name: 'Database', cat: 'Database', key: 'postgres' }
                    ].map((srv, idx) => {
                      const val = srv.val || healthStatus.services[srv.key];
                      const srvColor = getStatusColor(val);
                      const isClickable = !!srv.link;
                      return (
                        <div 
                          key={idx} 
                          style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center', 
                            fontSize: '0.8rem',
                            cursor: isClickable ? 'pointer' : 'default',
                            padding: '4px 6px',
                            borderRadius: '6px',
                            margin: '0 -6px',
                            transition: 'background 0.2s'
                          }}
                          onClick={() => {
                            if (isClickable) {
                              window.open(srv.link, '_blank');
                            }
                          }}
                          onMouseEnter={(e) => {
                            if (isClickable) {
                              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (isClickable) {
                              e.currentTarget.style.background = 'transparent';
                            }
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', fontWeight: 600 }}>
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: srvColor, boxShadow: `0 0 4px ${srvColor}` }} />
                            {srv.name}
                          </div>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 500 }}>{srv.cat}</span>
                        </div>
                      );
                    })}
                  </div>
                  
                  {/* Footer link */}
                  <div style={{ paddingTop: '0.65rem', borderTop: '1px solid var(--border-color)', textAlign: 'center' }}>
                    <a 
                      href={STATUS_PAGE_URL} 
                      target="_blank" 
                      rel="noreferrer"
                      style={{ fontSize: '0.78rem', color: 'var(--accent-color)', textDecoration: 'none', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                      {t('view_status')} <ExternalLink size={11} />
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}