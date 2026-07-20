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

// Prefetch on nav intent, via api.js's `prefetch` (which now exists, along with
// the SWR cache the previous comment here was waiting on).
//
// The Set still earns its place, and more so than before: prefetch() is
// stale-while-revalidate, so it returns the cached sheet AND fires a background
// revalidate every single time. Without this dedupe, sweeping the cursor across
// the nav would put a request on the wire per hover, forever — the cache would
// make the network chattier, not quieter. Once per URL per page load is enough.
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

  // Fetch navbar data from API
  useEffect(() => {
    const loadData = async () => {
      try {
        const navbarData = await fetchData(API_ENDPOINTS.navbar);
        setData(navbarData);
      } catch (error) {
        console.error('Failed to load navbar data:', error);
        // Fallback data in case of error
        setData({
          brand: 'KBG',
          tagline: 'Kamand Bioengineering Group',
          links: []
        });
      }
    };
    loadData();
  }, []);

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
    return null; // or return a loading skeleton
  }

  const closeMenu = () => {
    setIsMenuOpen(false);
  };

  const links = data.links || [];

  return (
    <>
      <nav className="nav">
        <div className="shell nav__inner">
          {/* === Brand: shield + KBG + tagline. One spine, hard-left. === */}
          <Link to="/" className="nav__brand" onClick={closeMenu}>
            {/* The shield, cropped out of the full logo. See .nav__mark in NavBar.css. */}
            <span className="nav__mark">
              <img src="/vite.svg" alt="" />
            </span>
            <span className="nav__brand-text">
              {data.brand && <span className="nav__brand-name">{data.brand}</span>}
              {data.tagline && (
                <span className="nav__brand-tagline label">{data.tagline}</span>
              )}
            </span>
          </Link>

          {/* === Mobile drawer toggle === */}
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

          {/* === Links === */}
          <div
            id="nav-links"
            className={`nav__links ${isMenuOpen ? 'is-open' : ''}`}
          >
            {links.map((link, i) => (
              <Link
                key={i}
                to={link.to}
                className={`nav__link label ${location.pathname === link.to ? 'is-active' : ''}`}
                aria-current={location.pathname === link.to ? 'page' : undefined}
                onClick={closeMenu}
                onPointerEnter={() => prefetchRoute(link.to)}
                onFocus={() => prefetchRoute(link.to)}
              >
                {link.label}
              </Link>
            ))}

          </div>
        </div>

        {/* The bar's bottom edge is a strand, broken at 71% — never a border. */}
        <div className="nav__edge rule rule--broken rule--sm" aria-hidden="true"></div>
      </nav>

      {/* === Drawer scrim === */}
      <div
        className={`nav__scrim ${isMenuOpen ? 'is-open' : ''}`}
        onClick={closeMenu}
        aria-hidden="true"
      ></div>
    </>
  );
};

export default NavBar;
