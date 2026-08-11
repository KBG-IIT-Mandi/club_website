import React, { useCallback, useEffect, useState } from 'react'
import './About.css'
import useDocumentTitle from '../../CustomHooks/useDocumentTitle'
import useDrawOnScroll from '../../CustomHooks/useDrawOnScroll'
import { API_ENDPOINTS, fetchData } from '../../config/api'
import { LoadingSpinner, ErrorState } from '../../Components/Loading'

const pad2 = (n) => String(n).padStart(2, '0')

const About = () => {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useDocumentTitle(data?.title || 'About')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const aboutData = await fetchData(API_ENDPOINTS.about)
      setData(aboutData)
    } catch (err) {
      console.error('Failed to load about data:', err)
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  /* The reveal system lives in useDrawOnScroll. One observer, no threshold
     (a threshold deadlocks .band — see the hook). One fetch, early returns
     until it lands: `!!data` flips exactly when the targets first exist. */
  const pageRef = useDrawOnScroll(!!data)

  if (loading) {
    return <LoadingSpinner variant="ring" />
  }

  if (error) {
    return (
      <ErrorState
        message="Failed to load about page data. Please try again later."
        onRetry={load}
      />
    )
  }

  if (!data) return null

  const contact = data.contact || null
  const features = Array.isArray(data.features) ? data.features : []
  const whatWeDo = Array.isArray(data.whatWeDo) ? data.whatWeDo : []
  const socials = Array.isArray(contact?.socials) ? contact.socials : []

  /* GHOST NUMERALS — the article reads as a numbered field-journal. The
     sequence walks the journal's sections in render order, counting only the
     ones the JSON actually ships: a missing field never leaves a hole in the
     numbering. This is real sequence information (document order), not
     decoration — and it renders aria-hidden because it indexes structure the
     reader already has. */
  let ghostCount = 0
  const ghost = (present) => (present ? pad2(++ghostCount) : null)
  const num = {
    mission: ghost(Boolean(data.mission)),
    prose: ghost(Boolean(data.history || data.aboutLong)),
    features: ghost(features.length > 0),
    whatWeDo: ghost(whatWeDo.length > 0),
    contact: ghost(Boolean(contact)),
  }

  return (
    <div className="p-about world-journal" ref={pageRef}>
      <div className="shell">
        {/* ── THE MASTHEAD ─────────────────────────────────────────────── */}
        <header className="about-head band">
          <p className="label">The journal</p>
          {data.title && <h1 className="display-2 about-title">{data.title}</h1>}
        </header>

        {/* ── MISSION — the pull-quote. 200 against the 900 masthead: the
               journal's whole typographic argument in one spread. ────────── */}
        {data.mission && (
          <p className="about-mission band">
            <span className="about-ghost" aria-hidden="true">{num.mission}</span>
            {data.mission}
          </p>
        )}

        {/* ── THE LONG READ — history, then the full account ───────────── */}
        {(data.history || data.aboutLong) && (
          <div className="about-prose band">
            <span className="about-ghost" aria-hidden="true">{num.prose}</span>
            {data.history && <p>{data.history}</p>}
            {data.aboutLong && <p>{data.aboutLong}</p>}
          </div>
        )}

        {/* ── FEATURES — margin-noted like a paper's numbered figures ──── */}
        {features.length > 0 && (
          <section className="section about-features">
            <div className="section-head band">
              <span className="about-ghost" aria-hidden="true">{num.features}</span>
              <h2>Features</h2>
              <div className="rule" aria-hidden="true" />
            </div>
            <ol className="feature-list">
              {features.map((f, i) => (
                <li className="feature row" style={{ '--i': i }} key={f.title || i}>
                  <p className="label feature__note">FEATURE {pad2(i + 1)}</p>
                  <div className="feature__body">
                    {f.title && <h3 className="feature__title">{f.title}</h3>}
                    {f.description && <p className="feature__desc">{f.description}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* ── WHAT WE DO — the tick-list of commitments ────────────────── */}
        {whatWeDo.length > 0 && (
          <section className="section about-do">
            <div className="section-head band">
              <span className="about-ghost" aria-hidden="true">{num.whatWeDo}</span>
              <h2>What we do</h2>
              <div className="rule" aria-hidden="true" />
            </div>
            <ul className="tick-list">
              {whatWeDo.map((item, i) => (
                <li className="row" style={{ '--i': i }} key={i}>
                  {item}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── CONTACT ──────────────────────────────────────────────────── */}
        {contact && (
          <section className="section about-contact">
            <div className="section-head band">
              <span className="about-ghost" aria-hidden="true">{num.contact}</span>
              <h2>Contact</h2>
              <div className="rule" aria-hidden="true" />
            </div>

            <div className="about-contact__grid">
              <div className="about-contact__details band">
                {contact.email && (
                  <a
                    className="btn-ghost about-contact__email"
                    href={`mailto:${contact.email}`}
                    data-cursor="explore"
                  >
                    {contact.email}
                  </a>
                )}
                {contact.location && (
                  <p className="about-contact__loc">{contact.location}</p>
                )}
              </div>

              {socials.length > 0 && (
                <ul className="about-socials">
                  {socials.map(
                    (social, i) =>
                      social.href && (
                        <li className="row" style={{ '--i': i }} key={social.label || i}>
                          <a
                            className="about-social"
                            href={social.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-cursor="explore"
                          >
                            <span className="about-social__label">{social.label}</span>
                            {social.handle && (
                              <span className="about-social__handle">{social.handle}</span>
                            )}
                          </a>
                        </li>
                      )
                  )}
                </ul>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

export default About
