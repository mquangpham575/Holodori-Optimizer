import { useLanguage } from '../context/LanguageContext';
import React, { useState, useEffect } from 'react';
import { X, BookOpen, User, Clock, Calendar } from 'lucide-react';
import './Guides.css';

export default function Guides({ guides = [] }) {
  const { t, currentLang } = useLanguage();
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [activeGuide, setActiveGuide] = useState(null);
  const [guideContent, setGuideContent] = useState('');
  const [loadingContent, setLoadingContent] = useState(false);

  // Derive categories from the actual guide data so they always match the
  // categories the admin form saves (General/Builds/Meta).
  const categories = [
    'All',
    ...Array.from(new Set(guides.map((g) => g.category).filter(Boolean))),
  ];

  const getLocalizedValue = (val, lang) => {
    if (!val) return '';
    if (typeof val === 'string') return val;
    return val[lang] || val['en'] || val[Object.keys(val)[0]] || '';
  };

  const filteredGuides = guides.filter((guide) => {
    if (guide.id === 'synergy-meta') return false; // Temporarily hidden
    return selectedCategory === 'All' || guide.category === selectedCategory;
  });

  // Load guide content dynamically when selected if it has a contentUrl.
  // The AbortController cancels the previous fetch when a different guide (or
  // language) is opened, preventing a stale response from overwriting content.
  useEffect(() => {
    if (!activeGuide) {
      setGuideContent('');
      return;
    }

    const localizedContentUrl = getLocalizedValue(activeGuide.contentUrl, currentLang);
    const localizedContent = getLocalizedValue(activeGuide.content, currentLang);
    const controller = new AbortController();

    if (localizedContentUrl) {
      setLoadingContent(true);
      fetch(localizedContentUrl, { signal: controller.signal })
        .then((res) => {
          if (!res.ok) throw new Error("Failed to load guide markdown");
          return res.text();
        })
        .then((text) => {
          setGuideContent(text);
          setLoadingContent(false);
        })
        .catch((err) => {
          if (err.name === 'AbortError') return;
          console.error("Error loading guide:", err);
          setGuideContent("Failed to load content.");
          setLoadingContent(false);
        });
    } else {
      setGuideContent(localizedContent || '');
    }

    return () => controller.abort();
  }, [activeGuide, currentLang]);

  // Custom sub-parser to format inline markdown elements (bold and links)
  const parseInlineFormatting = (text) => {
    if (!text) return '';
    
    const boldRegex = /\*\*(.*?)\*\*/g;
    const parts = text.split(boldRegex);
    
    return parts.map((part, i) => {
      const isBold = i % 2 === 1;
      
      const linkRegex = /\[(.*?)\]\((.*?)\)/g;
      const linkMatches = [...part.matchAll(linkRegex)];
      
      if (linkMatches.length === 0) {
        return isBold ? <strong key={i}>{part}</strong> : part;
      }
      
      const subParts = part.split(/\[.*?\]\(.*?\)/);
      const renderedSubParts = [];
      
      subParts.forEach((subPart, subIdx) => {
        renderedSubParts.push(subPart);
        if (subIdx < linkMatches.length) {
          const match = linkMatches[subIdx];
          renderedSubParts.push(
            <a 
              key={`link-${subIdx}`} 
              href={match[2]} 
              target="_blank" 
              rel="noopener noreferrer"
              className="guide-link"
            >
              {match[1]}
            </a>
          );
        }
      });
      
      return isBold ? <strong key={i}>{renderedSubParts}</strong> : renderedSubParts;
    });
  };

  // Custom parser to format markdown-like text content into HTML elements
  const parseGuideContent = (content) => {
    if (!content) return null;
    const lines = content.split('\n');
    let inList = false;
    let inTable = false;
    const elements = [];
    let listItems = [];
    let tableRows = []; // Will store parsed rows: { isHeader: boolean, cells: string[] }

    // Helper to flush current list
    const flushList = (keyIndex) => {
      if (inList && listItems.length > 0) {
        elements.push(<ul key={`list-${keyIndex}`}>{listItems}</ul>);
        listItems = [];
        inList = false;
      }
    };

    // Helper to flush current table
    const flushTable = (keyIndex) => {
      if (inTable && tableRows.length > 0) {
        elements.push(
          <div key={`table-wrapper-${keyIndex}`} className="guide-table-wrapper" style={{ overflowX: 'auto', margin: '20px 0' }}>
            <table className="guide-table" style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
              <thead>
                {tableRows.filter(r => r.isHeader).map((row, rIdx) => (
                  <tr key={`th-${rIdx}`} style={{ background: 'rgba(255, 255, 255, 0.05)', borderBottom: '2px solid var(--border-color)' }}>
                    {row.cells.map((cell, cIdx) => (
                      <th key={`h-${cIdx}`} style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                        {parseInlineFormatting(cell.trim())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {tableRows.filter(r => !r.isHeader).map((row, rIdx) => (
                  <tr key={`tr-${rIdx}`} style={{ borderBottom: '1px solid var(--border-color)', background: rIdx % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.02)' }}>
                    {row.cells.map((cell, cIdx) => (
                      <td key={`d-${cIdx}`} style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>
                        {parseInlineFormatting(cell.trim())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        tableRows = [];
        inTable = false;
      }
    };

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      
      const isTableRow = trimmed.startsWith('|') && trimmed.endsWith('|');
      
      if (isTableRow) {
        flushList(index);
        
        const rawCells = trimmed.split('|').slice(1, -1);
        const isSeparator = rawCells.every(c => /^[:\s-]+$/.test(c));
        
        if (isSeparator) {
          inTable = true;
        } else {
          inTable = true;
          const isHeader = (tableRows.length === 0);
          tableRows.push({ isHeader, cells: rawCells });
        }
      } else {
        flushTable(index);
        
        // Handle Headings
        if (trimmed.startsWith('# ')) {
          flushList(index);
          elements.push(<h1 key={index} className="guide-h1">{trimmed.substring(2)}</h1>);
        } else if (trimmed.startsWith('## ')) {
          flushList(index);
          elements.push(<h2 key={index} className="guide-h2">{trimmed.substring(3)}</h2>);
        } else if (trimmed.startsWith('### ')) {
          flushList(index);
          elements.push(<h3 key={index} className="guide-h3">{trimmed.substring(4)}</h3>);
        } 
        // Handle Images: ![alt](url)
        else if (trimmed.startsWith('![') && trimmed.endsWith(')')) {
          flushList(index);
          const imgRegex = /!\[(.*?)\]\((.*?)\)/;
          const match = trimmed.match(imgRegex);
          if (match) {
            const alt = match[1];
            const src = match[2];
            elements.push(
              <div key={index} className="guide-img-container" style={{ margin: '25px auto', textAlign: 'center', maxWidth: '100%' }}>
                <img 
                  src={src} 
                  alt={alt} 
                  style={{ 
                    maxWidth: '100%', 
                    maxHeight: '450px',
                    borderRadius: '12px', 
                    border: '1.5px solid rgba(255, 255, 255, 0.1)',
                    boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
                    objectFit: 'contain'
                  }} 
                />
                {alt && <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '8px', fontStyle: 'italic' }}>{alt}</p>}
              </div>
            );
          }
        }
        // Handle Lists
        else if (trimmed.startsWith('- ')) {
          inList = true;
          const itemText = trimmed.substring(2);
          listItems.push(<li key={`li-${index}`} className="guide-li">{parseInlineFormatting(itemText)}</li>);
        } 
        // Handle Paragraphs
        else if (trimmed.length > 0) {
          flushList(index);
          elements.push(<p key={index} className="guide-p">{parseInlineFormatting(trimmed)}</p>);
        } else {
          flushList(index);
        }
      }
    });

    flushList('final');
    flushTable('final');

    return elements;
  };

  return (
    <div className="guides-page animate-fade-in">
      <div className="guides-header">
        <h1 className="page-title"><BookOpen className="title-icon inline-icon" /> {t('guides_page_title')}</h1>
        <p className="page-subtitle">{t('guides_page_subtitle')}</p>
      </div>

      {/* Categories filter */}
      <div className="guides-filter glass">
        {categories.map((cat) => (
          <button
            key={cat}
            className={`filter-btn ${selectedCategory === cat ? 'active' : ''}`}
            onClick={() => setSelectedCategory(cat)}
          >
            {cat === 'All' ? t('all') : (cat === 'Guides' ? t('guides') : cat)}
          </button>
        ))}
      </div>

      {/* Guides Grid */}
      <div className="guides-grid">
        {filteredGuides.map((guide) => (
          <div 
            key={guide.id} 
            className="guide-card glass"
            onClick={() => setActiveGuide(guide)}
          >
            <div className="guide-card-header">
              <span className="guide-category">{guide.category}</span>
              <span className="guide-read-time"><Clock size={12} /> {guide.readTime}</span>
            </div>
            <h2 className="guide-title">{getLocalizedValue(guide.title, currentLang)}</h2>
            <p className="guide-summary">{getLocalizedValue(guide.summary, currentLang)}</p>
            <div className="guide-meta">
              <span className="guide-author"><User size={12} /> {guide.author}</span>
              <span className="guide-date"><Calendar size={12} /> {guide.date}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Guide Reader Modal */}
      {activeGuide && (
        <div className="modal-overlay" onClick={() => setActiveGuide(null)}>
          <div className="modal-content glass reader-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setActiveGuide(null)}>
              <X size={20} />
            </button>

            <div className="reader-header">
              <span className="guide-category">{activeGuide.category}</span>
              <h1 className="reader-title">{getLocalizedValue(activeGuide.title, currentLang)}</h1>
              
              <div className="reader-meta">
                <div className="meta-item">
                  <User size={14} />
                  <span>Written by <strong>{activeGuide.author}</strong></span>
                </div>
                <div className="meta-item">
                  <Calendar size={14} />
                  <span>Published on <strong>{activeGuide.date}</strong></span>
                </div>
                <div className="meta-item">
                  <Clock size={14} />
                  <span>Read time: <strong>{activeGuide.readTime}</strong></span>
                </div>
              </div>
            </div>

            <div className="reader-body">
              {loadingContent ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)' }}>
                  Loading article content...
                </div>
              ) : (
                parseGuideContent(guideContent)
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
