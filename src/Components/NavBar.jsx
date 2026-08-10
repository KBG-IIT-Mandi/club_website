import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import './NavBar.css';
import { API_ENDPOINTS, fetchData, prefetch } from '../config/api';

// link.to -> API_ENDPOINTS key. Only these five routes carry data.
const ENDPOINT_FOR_PATH = {
  '/': 'home',
  '/about': 'about',
  '/team': 'team',
  '/events': 'events',
  '/projects': 'projects',
};

// Prefetch on nav intent. The Set dedupes: prefetch() is
// stale-while-revalidate, so without it every hover would put a request on
// the wire. Once per URL per page load is enough.
const prefetched = new Set();

const prefetchRoute = (to) => {
  const key = ENDPOINT_FOR_PATH[to];
  const url = key ? API_ENDPOINTS[key] : null;
  if (!url || prefetched.has(url)) return;
  prefetched.add(url);
  prefetch(url);
};

const NavBar = () => {
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [data, setData] = useState(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        const navbarData = await fetchData(API_ENDPOINTS.navbar);
        setData(navbarData);
      } catch (error) {
        console.error('Failed to load navbar data:', error);
        setData({
          brand: 'KBG',
          tagline: 'Kamand Bioengineering Group',
          links: [],
        });
      }
    };
    loadData();
  }, []);

  // The brand mark is a living blob inside the hero and a square instrument
  // past it. Transparency is a HOME-HERO privilege: every other route starts
  // with content (About starts on IVORY, where light nav text would vanish),
  // so off-home the bar always carries its backdrop.
  useEffect(() => {
    const onScroll = () =>
      setScrolled(window.scrollY > 48 || location.pathname !== '/');
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [location.pathname]);

  // Close menu when route changes
  useEffect(() => {
    setIsMenuOpen(false);
  }, [location.pathname]);

  // Prevent body scroll when menu is open
  useEffect(() => {
    if (isMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isMenuOpen]);

  // Escape closes the drawer — the scrim is pointer-only otherwise.
  useEffect(() => {
    if (!isMenuOpen) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setIsMenuOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isMenuOpen]);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  if (!data) {
    return null;
  }

  const closeMenu = () => {
    setIsMenuOpen(false);
  };

  const links = data.links || [];

  return (
    <>
      <nav className={`nav ${scrolled ? 'is-scrolled' : ''}`}>
        <div className="shell nav__inner">
          {/* Brand: the mark is alive at the top of the page (membrane blob,
              breathing) and hardens into a square instrument once you scroll.
              Life -> instrument, in one border-radius transition. */}
          <Link to="/" className="nav__brand" onClick={closeMenu}>
            <span className="nav__mark" aria-hidden="true" />
            <span className="nav__brand-text">
              {data.brand && <span className="nav__brand-name">{data.brand}</span>}
              {data.tagline && (
                <span className="nav__brand-tagline">{data.tagline}</span>
              )}
            </span>
          </Link>

          {/* Mobile drawer toggle */}
          <button
            type="button"
            className={`nav__toggle ${isMenuOpen ? 'is-open' : ''}`}
            onClick={toggleMenu}
            aria-label="Toggle menu"
            aria-expanded={isMenuOpen}
            aria-controls="nav-links"
          >
            <span className="nav__bar"></span>
            <span className="nav__bar"></span>
            <span className="nav__bar"></span>
          </button>

          {/* Links + system status */}
          <div
            id="nav-links"
            className={`nav__links ${isMenuOpen ? 'is-open' : ''}`}
          >
            {links.map((link, i) => (
              <Link
                key={i}
                to={link.to}
                className={`nav__link ${location.pathname === link.to ? 'is-active' : ''}`}
                aria-current={location.pathname === link.to ? 'page' : undefined}
                onClick={closeMenu}
                onPointerEnter={() => prefetchRoute(link.to)}
                onFocus={() => prefetchRoute(link.to)}
              >
                {link.label}
              </Link>
            ))}

            <span className="nav__status" aria-hidden="true">
              <span className="nav__status-dot" />
              EVOLVING
            </span>
          </div>
        </div>

        <div className="nav__edge" aria-hidden="true"></div>
      </nav>

      {/* Drawer scrim */}
      <div
        className={`nav__scrim ${isMenuOpen ? 'is-open' : ''}`}
        onClick={closeMenu}
        aria-hidden="true"
      ></div>
    </>
  );
};

export default NavBar;
