import { NavLink, useNavigate } from 'react-router-dom';
import { Home, Users, Layers, BookOpen, Sparkles } from 'lucide-react';
import './Navbar.css';

/**
 * Navbar - Premium navigation header for the application.
 */
export default function Navbar() {
  const navigate = useNavigate();
  const navItems = [
    { path: '/home', label: 'Home', icon: Home },
    { path: '/characters', label: 'Characters', icon: Users },
    { path: '/builder', label: 'Team Builder', icon: Layers },
    { path: '/guides', label: 'Guides', icon: BookOpen }
  ];

  return (
    <header className="navbar glass">
      <div className="nav-container">
        <div className="brand" onClick={() => navigate('/home')}>
          <Sparkles className="brand-icon" />
          <span className="brand-title">HoloDreams <span className="title-glow">Showcase</span></span>
        </div>

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
                    <span className="nav-label">{item.label}</span>
                    {isActive && <span className="active-indicator" />}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
