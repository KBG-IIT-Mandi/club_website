import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import './NavBar.css';
import { API_ENDPOINTS, fetchData, prefetch } from '../config/api';
import { prefetchRouteModule } from '../config/routes';

/* The global wayfinding must never depend on the content network. Remote JSON
   may rename/reorder these labels, but this complete local record paints on
   frame one and remains available offline. */
const DEFAULT_NAV = {
  brand: 'KBG',
  tagline: 'Kamand Bioengineering Group',
  links: [
    { label: 'Home', to: '/' },
    { label: 'About', to: '/about' },
    { label: 'Team', to: '/team' },
    { label: 'Events', to: '/events' },
    { label: 'Projects', to: '/projects' },
    { label: 'Race', to: '/race' },
  ],
};

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
  prefetchRouteModule(to);
  const key = ENDPOINT_FOR_PATH[to];
  const url = key ? API_ENDPOINTS[key] : null;
  if (!url || prefetched.has(url)) return;
  prefetched.add(url);
  prefetch(url);
};

const NavBar = () => {
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [data, setData] = useState(DEFAULT_NAV);
  const [scrolled, setScrolled] = useState(false);
  const toggleRef = useRef(null);
  const progressRef = useRef(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const navbarData = await fetchData(API_ENDPOINTS.navbar);
        const remoteLinks = Array.isArray(navbarData?.links)
          ? navbarData.links.filter((link) => link?.label && link?.to)
          : [];
        /* Race is a first-class interactive route and should remain globally
           discoverable even while older navbar JSON is still in circulation. */
        const links = remoteLinks.length ? [...remoteLinks] : DEFAULT_NAV.links;
        if (!links.some((link) => link.to === '/race')) {
          links.push(DEFAULT_NAV.links.at(-1));
        }
        setData({ ...DEFAULT_NAV, ...navbarData, links });
      } catch (error) {
        console.error('Failed to load navbar data:', error);
        setData(DEFAULT_NAV);
      }
    };
    loadData();
  }, []);

  // The brand mark is a living blob inside the hero and a square instrument
  // past it. Transparency is a HOME-HERO privilege: every other route starts
  // with content (About starts on IVORY, where light nav text would vanish),
  // so off-home the bar always carries its backdrop.
  useEffect(() => {
    let frame = 0;
    const sync = () => {
      frame = 0;
      setScrolled(window.scrollY > 48 || location.pathname !== '/');
      const available = document.documentElement.scrollHeight - window.innerHeight;
      const progress = available > 0 ? Math.min(1, window.scrollY / available) : 0;
      progressRef.current?.style.setProperty('--nav-progress', progress);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(sync);
    };
    sync();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [location.pathname]);

  // Close menu when route changes
  useEffect(() => {
    setIsMenuOpen(false);
  }, [location.pathname]);

  // Drawer open: lock body scroll AND take the covered page out of the tab
  // order — a full-void overlay with reachable content behind it is a
  // keyboard trap in reverse. NavBar doesn't render <main>/<footer>, so the
  // attribute is toggled on the live DOM; cleanup always restores.
  useEffect(() => {
    const covered = document.querySelectorAll('main, footer');
    if (isMenuOpen) {
      document.body.style.overflow = 'hidden';
      covered.forEach((el) => el.setAttribute('inert', ''));
    } else {
      document.body.style.overflow = 'unset';
      covered.forEach((el) => el.removeAttribute('inert'));
    }
    return () => {
      document.body.style.overflow = 'unset';
      covered.forEach((el) => el.removeAttribute('inert'));
    };
  }, [isMenuOpen]);

  // Escape closes the drawer — the scrim is pointer-only otherwise.
  useEffect(() => {
    if (!isMenuOpen) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsMenuOpen(false);
        window.requestAnimationFrame(() => toggleRef.current?.focus());
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isMenuOpen]);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const closeMenu = () => {
    setIsMenuOpen(false);
  };

  const links = data.links || [];

  return (
    <>
      <nav
        className={`nav ${scrolled ? 'is-scrolled' : ''} ${isMenuOpen ? 'is-menu-open' : ''}`}
        aria-label="Primary"
      >
        <div className="shell nav__inner">
          {/* Brand: the real mark — shield, helix and gear. */}
          <Link
            to="/"
            className="nav__brand"
            onClick={closeMenu}
            onPointerEnter={() => prefetchRoute('/')}
            onFocus={() => prefetchRoute('/')}
          >
            <span className="nav__mark" aria-hidden="true">
              <img src="/kbg.svg" alt="" width="30" height="30" />
            </span>
            <span className="nav__brand-text">
              {data.brand && <span className="nav__brand-name">{data.brand}</span>}
              {data.tagline && (
                <span className="nav__brand-tagline">{data.tagline}</span>
              )}
              <span className="nav__brand-meta" aria-hidden="true">
                Bioengineering · IIT Mandi
              </span>
            </span>
          </Link>

          {/* Mobile drawer toggle */}
          <button
            ref={toggleRef}
            type="button"
            className={`nav__toggle ${isMenuOpen ? 'is-open' : ''}`}
            onClick={toggleMenu}
            aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={isMenuOpen}
            aria-controls="nav-links"
          >
            <span className="nav__toggle-label" aria-hidden="true">
              {isMenuOpen ? 'Close' : 'Menu'}
            </span>
            <span className="nav__toggle-bars" aria-hidden="true">
              <span className="nav__bar" />
              <span className="nav__bar" />
              <span className="nav__bar" />
            </span>
          </button>

          {/* Links + system status */}
          <div
            id="nav-links"
            className={`nav__links ${isMenuOpen ? 'is-open' : ''}`}
          >
            {links.map((link, i) => (
              <Link
                key={`${link.to}-${i}`}
                to={link.to}
                className={`nav__link${link.to === '/race' ? ' nav__link--race' : ''}${location.pathname === link.to ? ' is-active' : ''}`}
                aria-current={location.pathname === link.to ? 'page' : undefined}
                onClick={closeMenu}
                onPointerEnter={() => prefetchRoute(link.to)}
                onFocus={() => prefetchRoute(link.to)}
              >
                <span>{link.label}</span>
                {link.to === '/race' && (
                  <span className="nav__link-badge">Live sim</span>
                )}
                <span className="nav__link-index" aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
              </Link>
            ))}

            <span className="nav__status" aria-hidden="true">
              <span className="nav__status-dot" />
              EVOLVING
            </span>
          </div>
        </div>

        <div className="nav__edge" aria-hidden="true">
          <span ref={progressRef} className="nav__progress" />
        </div>
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
