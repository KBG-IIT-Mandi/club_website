import React, { useCallback, useEffect, useState } from 'react';
import './Home.css';
import useDocumentTitle from '../../CustomHooks/useDocumentTitle';
import useDrawOnScroll from '../../CustomHooks/useDrawOnScroll';
import { API_ENDPOINTS, fetchData } from '../../config/api';
import { LoadingSpinner, ErrorState } from '../../Components/Loading';

const Home = () => {
  useDocumentTitle('Home');

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const homeData = await fetchData(API_ENDPOINTS.home);
      setData(homeData);
    } catch (err) {
      console.error('Failed to load home data:', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /* The reveal system lives in useDrawOnScroll. One observer, no threshold
     (a threshold deadlocks .band — see the hook), and no per-page options. */
  const pageRef = useDrawOnScroll(!!data);

  if (loading) {
    return <LoadingSpinner variant="dna" />;
  }

  if (error || !data) {
    return (
      <ErrorState
        message="The home sheet did not arrive. Check your connection and draw it again."
        onRetry={load}
      />
    );
  }

  const hero = data.hero || {};
  const highlights = Array.isArray(data.highlights) ? data.highlights : [];
  const sections = Array.isArray(data.sections) ? data.sections : [];
  const tracks = Array.isArray(data.tracks) ? data.tracks : [];
  const stories = Array.isArray(data.stories) ? data.stories : [];
  const contact = data.contact || null;

  /* HIERARCHY INVERTED USING ONLY EXISTING KEYS.
     hero.title ("KBG - Kamand Bioengineering Group") is the fourth repetition of what
     the nav already says — it drops to a mono label. hero.subtitle is the actual
     proposition, so it becomes the h1. Guarded: the JSON lives in another repo. */
  const heroEyebrow = hero.subtitle ? hero.title : null;
  const heroHeading = hero.subtitle || hero.title;
  const cta = hero.cta && hero.cta.href && hero.cta.label ? hero.cta : null;

  return (
    <main className="p-home" ref={pageRef}>
      {/* ── HERO ────────────────────────────────────────────────────────── */}
      <section className="section hero-block">
        <div className="shell">
          <div className="hero-copy band">
            {heroEyebrow && <p className="label hero-eyebrow">{heroEyebrow}</p>}
            {heroHeading && <h1 className="hero-title">{heroHeading}</h1>}
          </div>

          <div className="rule--broken hero-rule row" />

          {hero.description && (
            <p className="lead hero-description band">
              {hero.description}
            </p>
          )}

          {cta && (
            <p className="hero-actions">
              <a className="btn-primary" href={cta.href}>
                {cta.label}
              </a>
            </p>
          )}
        </div>
      </section>

      {/* ── HIGHLIGHTS ──────────────────────────────────────────────────── */}
      {!!highlights.length && (
        <section className="section">
          <div className="shell">
            <div className="entry-grid">
              {highlights.map((item, i) => (
                <article
                  key={item.title || i}
                  className="entry row"
                  style={{ '--i': i }}
                >
                  <div className="rule--broken rule--sm" />
                  {item.title && <h3>{item.title}</h3>}
                  {item.text && <p className="caption">{item.text}</p>}
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── NARRATIVE ───────────────────────────────────────────────────── */}
      {!!sections.length && (
        <section className="section">
          <div className="shell narrative">
            {sections.map((section, i) => (
              <article key={section.title || i} className="narrative-band band">
                <div className="section-head">
                  <div className="rule--broken" />
                  {section.title && <h2>{section.title}</h2>}
                </div>
                {section.copy && <p>{section.copy}</p>}
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

      {/* ── TRACKS ──────────────────────────────────────────────────────── */}
      {!!tracks.length && (
        <section className="section">
          <div className="shell">
            <div className="section-head band">
              <div className="rule--broken" />
              <h2>Focus Tracks</h2>
            </div>
            <div className="entry-grid">
              {tracks.map((track, i) => (
                <article
                  key={track.title || i}
                  className="entry row"
                  style={{ '--i': i }}
                >
                  <div className="rule--broken rule--sm" />
                  {track.title && <h3>{track.title}</h3>}
                  {track.summary && <p className="caption">{track.summary}</p>}
                  {Array.isArray(track.focus) && track.focus.length > 0 && (
                    <ul className="tick-list entry-foot">
                      {track.focus.map((f, fi) => (
                        <li key={fi}>{f}</li>
                      ))}
                    </ul>
                  )}
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── FIELD NOTES ─────────────────────────────────────────────────────
          stories[].author and .role are empty strings in the live JSON and the
          quotes are general science facts, not member testimonials. They render
          as figure captions; the attribution is guarded, so no empty
          <span>/<small> ever ships. */}
      {!!stories.length && (
        <section className="section">
          <div className="shell">
            <div className="section-head band">
              <div className="rule--broken" />
              <h2>Field Notes</h2>
            </div>
            <div className="entry-grid">
              {stories.map((story, i) => (
                <figure key={i} className="entry story row" style={{ '--i': i }}>
                  <div className="rule--broken rule--sm" />
                  {story.quote && <blockquote>{story.quote}</blockquote>}
                  {(story.author || story.role) && (
                    <figcaption className="entry-foot story-caption">
                      {story.author && <span className="label">{story.author}</span>}
                      {story.role && <span className="caption">{story.role}</span>}
                    </figcaption>
                  )}
                </figure>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── CONTACT ─────────────────────────────────────────────────────── */}
      {contact && (
        <section className="section">
          <div className="shell">
            <div className="entry contact-entry row">
              <div className="rule--broken" />
              {contact.headline && <h2>{contact.headline}</h2>}
              {contact.description && <p>{contact.description}</p>}

              <div className="contact-foot entry-foot">
                {contact.email && (
                  <a className="btn-ghost" href={`mailto:${contact.email}`}>
                    {contact.email}
                  </a>
                )}
                {contact.phone && <span className="meta">{contact.phone}</span>}
              </div>

              {Array.isArray(contact.socials) && contact.socials.length > 0 && (
                <ul className="contact-socials">
                  {contact.socials.map((s, i) =>
                    s && s.href && s.label ? (
                      <li key={s.label || i}>
                        <a
                          className="label contact-social"
                          href={s.href}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {s.label}
                        </a>
                      </li>
                    ) : null
                  )}
                </ul>
              )}
            </div>
          </div>
        </section>
      )}
    </main>
  );
};

export default Home;
