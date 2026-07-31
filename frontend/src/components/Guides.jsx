import React, { useState } from 'react';
import { X, BookOpen, User, Clock, Calendar } from 'lucide-react';
import { GUIDES } from '../data';
import './Guides.css';

export default function Guides() {
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [activeGuide, setActiveGuide] = useState(null);

  const categories = ['All', 'General', 'Builds', 'Meta'];

  const filteredGuides = GUIDES.filter((guide) => {
    return selectedCategory === 'All' || guide.category === selectedCategory;
  });

  // Custom parser to format markdown-like text content into HTML elements
  const parseGuideContent = (content) => {
    if (!content) return null;
    const lines = content.split('\n');
    let inList = false;
    const elements = [];
    let listItems = [];

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      
      // Handle Headings
      if (trimmed.startsWith('# ')) {
        if (inList) {
          elements.push(<ul key={`list-${index}`}>{listItems}</ul>);
          listItems = [];
          inList = false;
        }
        elements.push(<h1 key={index} className="guide-h1">{trimmed.substring(2)}</h1>);
      } else if (trimmed.startsWith('## ')) {
        if (inList) {
          elements.push(<ul key={`list-${index}`}>{listItems}</ul>);
          listItems = [];
          inList = false;
        }
        elements.push(<h2 key={index} className="guide-h2">{trimmed.substring(3)}</h2>);
      } else if (trimmed.startsWith('### ')) {
        if (inList) {
          elements.push(<ul key={`list-${index}`}>{listItems}</ul>);
          listItems = [];
          inList = false;
        }
        elements.push(<h3 key={index} className="guide-h3">{trimmed.substring(4)}</h3>);
      } 
      // Handle Lists
      else if (trimmed.startsWith('- ')) {
        inList = true;
        
        // Simple inline parser for bold text inside lists
        const itemText = trimmed.substring(2);
        const boldRegex = /\*\*(.*?)\*\*/g;
        const parts = itemText.split(boldRegex);
        
        const renderedParts = parts.map((part, i) => {
          if (i % 2 === 1) return <strong key={i}>{part}</strong>;
          return part;
        });

        listItems.push(<li key={`li-${index}`} className="guide-li">{renderedParts}</li>);
      } 
      // Handle Paragraphs
      else if (trimmed.length > 0) {
        if (inList) {
          elements.push(<ul key={`list-${index}`}>{listItems}</ul>);
          listItems = [];
          inList = false;
        }

        // Simple inline parser for bold text in paragraphs
        const boldRegex = /\*\*(.*?)\*\*/g;
        const parts = trimmed.split(boldRegex);
        const renderedParts = parts.map((part, i) => {
          if (i % 2 === 1) return <strong key={i}>{part}</strong>;
          return part;
        });

        elements.push(<p key={index} className="guide-p">{renderedParts}</p>);
      } else {
        if (inList) {
          elements.push(<ul key={`list-${index}`}>{listItems}</ul>);
          listItems = [];
          inList = false;
        }
      }
    });

    if (inList && listItems.length > 0) {
      elements.push(<ul key="list-final">{listItems}</ul>);
    }

    return elements;
  };

  return (
    <div className="guides-page animate-fade-in">
      <div className="guides-header">
        <h1 className="page-title"><BookOpen className="title-icon inline-icon" /> Game Guides & Blog</h1>
        <p className="page-subtitle">Learn strategies, character insights, and guide builds to optimize your Hololive Dreams progression.</p>
      </div>

      {/* Categories filter */}
      <div className="guides-filter glass">
        {categories.map((cat) => (
          <button
            key={cat}
            className={`filter-btn ${selectedCategory === cat ? 'active' : ''}`}
            onClick={() => setSelectedCategory(cat)}
          >
            {cat}
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
            <h2 className="guide-title">{guide.title}</h2>
            <p className="guide-summary">{guide.summary}</p>
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
              <h1 className="reader-title">{activeGuide.title}</h1>
              
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
              {parseGuideContent(activeGuide.content)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
