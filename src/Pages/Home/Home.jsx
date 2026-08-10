import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import './Home.css';
import useDocumentTitle from '../../CustomHooks/useDocumentTitle';
import useDrawOnScroll from '../../CustomHooks/useDrawOnScroll';
import { API_ENDPOINTS, fetchData } from '../../config/api';
import { ErrorState } from '../../Components/Loading';

/* The field (gsap + the three scene behind it) is its own chunk. The hero
   copy below paints from the main bundle; the Suspense fallback holds the
   identical layout so nothing shifts when the chunk lands. */
const SpecimenField = lazy(() => import('../../Components/Organism/Descent'));

/* ── live telemetry — numbers that drift like an instrument, not a GIF ───── */

const useTelemetry = () => {
  const [activity, setActivity] = useState(94.7);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return undefined;
    }
    const id = setInterval(() => {
      setActivity((a) => {
        const next = a + (Math.random() - 0.5) * 0.8;
        return Math.min(97.3, Math.max(91.8, Math.round(next * 10) / 10));
      });
    }, 2400);
    return () => clearInterval(id);
  }, []);
  return activity;
};

/* ── the hero overlay — pure HTML/CSS, paints before the three chunk ─────── */

const Hero = ({ home }) => {
  const activity = useTelemetry();
  const hero = home?.hero || {};
  const cta = hero.cta && hero.cta.href && hero.cta.label ? hero.cta : null;

  return (
    <>
      <div className="hud" aria-hidden="true">
        <div className="hud__block hud__block--tl">
          <span>SPECIMEN 001</span>
          <span>KAMAND BIOENGINEERING GROUP</span>
        </div>
        <div className="hud__block hud__block--tr">
          <span>
            CELLULAR ACTIVITY <b className="hud__live">{activity.toFixed(1)}%</b>
          </span>
          <span>GENE EXPRESSION <b className="hud__live">ACTIVE</b></span>
          <span>SYSTEM STATUS <b className="hud__live">EVOLVING</b></span>
        </div>
      </div>

      <div className="hero-copy">
        <h1 className="display hero-thesis">
          Life is now an engineering medium<span className="hero-thesis__dot">.</span>
        </h1>

        {hero.subtitle && <p className="hero-sub">{hero.subtitle}</p>}

        <div className="hero-actions">
          <Link className="btn-primary" to="/projects" data-cursor="explore">
            Enter the lab
          </Link>
          {cta && (
            <a className="btn-ghost" href={cta.href} data-cursor="explore">
              Join the collective
            </a>
          )}
        </div>
      </div>

      <p className="hero-cue" aria-hidden="true">
        SCROLL TO DESCEND <span className="hero-cue__arrow">↓</span>
      </p>
    </>
  );
};

/* ── the page ────────────────────────────────────────────────────────────── */

const Home = () => {
  useDocumentTitle('Home');

  const [home, setHome] = useState(null);
  const [homeError, setHomeError] = useState(false);
  const [projects, setProjects] = useState(null);
  const [events, setEvents] = useState(null);

  const loadHome = useCallback(async () => {
    setHomeError(false);
    try {
      setHome(await fetchData(API_ENDPOINTS.home));
    } catch (err) {
      console.error('Failed to load home data:', err);
      setHomeError(true);
    }
  }, []);

  useEffect(() => {
    loadHome();
    /* teaser + tray are enrichment: fail-silent, sections simply absent */
    fetchData(API_ENDPOINTS.projects)
      .then((d) => setProjects(Array.isArray(d?.projects) ? d.projects : null))
      .catch(() => {});
    fetchData(API_ENDPOINTS.events)
      .then((d) => setEvents(Array.isArray(d?.upcoming) ? d.upcoming : null))
      .catch(() => {});
  }, [loadHome]);

  /* The reveal hook collects .band/.row targets when `ready` CHANGES — but
     this page's sections arrive from three async fetches at different times.
     A boolean would arm once and permanently miss later arrivals, leaving
     whole bands at opacity 0. The signature re-runs the effect per arrival. */
  const pageRef = useDrawOnScroll(`${!!home}-${!!projects}-${!!events}`);

  const sections = Array.isArray(home?.sections) ? home.sections : [];
  const teaser = Array.isArray(projects) ? projects.slice(0, 3) : [];
  const upcoming = Array.isArray(events) ? events.slice(0, 3) : [];
  const mailto = home?.hero?.cta?.href || 'mailto:kbg@students.iitmandi.ac.in';

  const heroContent = <Hero home={home} />;

  return (
    <div className="p-home" ref={pageRef}>
      {/* ── THE SPECIMEN + THE DESCENT ─────────────────────────────────── */}
      <Suspense
        fallback={
          <div className="specimen-field">
            <div className="specimen-field__sticky">
              <div className="specimen-field__hero">{heroContent}</div>
            </div>
          </div>
        }
      >
        <SpecimenField hero={heroContent} />
      </Suspense>

      {/* ── THE JOURNAL — ivory editorial band ─────────────────────────── */}
      {/* The error panel is a LAB surface (dark ground, lime rail): rendered
          inside .world-journal its text would inherit journal ink and land at
          ~1-3:1 contrast. It lives on lab ground, outside the ivory band. */}
      {homeError && (
        <section className="section world-lab">
          <ErrorState
            message="The journal did not arrive. Check your connection and try again."
            onRetry={loadHome}
          />
        </section>
      )}
      {sections.length > 0 && (
        <section className="section world-journal home-journal">
          <div className="shell">
            {/* The nameplate every world carries — THE ARCHIVE, THE
                CONSTELLATION, THE SAMPLE LOG — the journal gets its own. */}
            <p className="label home-journal__plate band">THE FIELD JOURNAL</p>
            {sections.map((section, i) => (
              <article key={section.title || i} className="home-journal__article band">
                {section.title && (
                  <h2 className="home-journal__head display-2">{section.title}</h2>
                )}
                {section.copy && <p className="home-journal__copy">{section.copy}</p>}
                {Array.isArray(section.bullets) && section.bullets.length > 0 && (
                  <ul className="tick-list">
                    {section.bullets.map((b, bi) => (
                      <li key={bi}>{b}</li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {/* ── LIVE EXPERIMENTS — teaser dossiers ─────────────────────────── */}
      {teaser.length > 0 && (
        <section className="section world-lab home-lab">
          <div className="shell">
            <div className="section-head band">
              <p className="label label--live">LIVE EXPERIMENTS</p>
              <h2>Current specimens</h2>
            </div>
            <div className="entry-grid">
              {teaser.map((project, i) => (
                <article key={project.name || i} className="entry row" style={{ '--i': i }}>
                  <p className="label">EXPERIMENT {String(i + 1).padStart(2, '0')}</p>
                  {project.name && <h3>{project.name}</h3>}
                  {project.summary && <p className="caption">{project.summary}</p>}
                  {Array.isArray(project.tech) && project.tech.length > 0 && (
                    <div className="tag-row entry-foot">
                      {project.tech.slice(0, 3).map((t, ti) => (
                        <span key={ti} className="tag">{t}</span>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
            <p className="home-lab__more">
              <Link className="btn-ghost" to="/projects" data-cursor="open">
                Open the archive
              </Link>
            </p>
          </div>
        </section>
      )}

      {/* ── SAMPLE TRAY — upcoming events as labelled samples ──────────── */}
      {upcoming.length > 0 && (
        <section className="section world-lab home-tray">
          <div className="shell">
            <div className="section-head band">
              <p className="label label--live">SAMPLE TRAY</p>
              <h2>Upcoming</h2>
            </div>
            <ul className="home-tray__list">
              {upcoming.map((event, i) => (
                <li key={event.title || i} className="home-tray__item row" style={{ '--i': i }}>
                  <Link to="/events" className="home-tray__link" data-cursor="open">
                    <span className="tag tag--live">SAMPLE {event.date || '—'}</span>
                    <span className="home-tray__title">{event.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* ── JOIN MEMBRANE ──────────────────────────────────────────────── */}
      <section className="section world-lab home-join">
        <div className="shell home-join__inner band">
          <div className="home-join__blob" aria-hidden="true" />
          <h2 className="display-2">Grow with us</h2>
          <p className="home-join__copy">
            The lab takes new researchers every semester. Bring biology,
            bring code, bring hardware — bring curiosity.
          </p>
          <a className="btn-primary" href={mailto} data-cursor="explore">
            Join the collective
          </a>
        </div>
      </section>
    </div>
  );
};

export default Home;
