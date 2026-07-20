import React, { useCallback, useEffect, useState } from 'react'
import './About.css'
import useDocumentTitle from '../../CustomHooks/useDocumentTitle'
import useDrawOnScroll from '../../CustomHooks/useDrawOnScroll'
import { API_ENDPOINTS, fetchData } from '../../config/api'
import { LoadingSpinner, ErrorState } from '../../Components/Loading'

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
     (a threshold deadlocks .band — see the hook), and no per-page options. */
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

  return (
    <section className="p-about" ref={pageRef}>
      <div className="shell">
        <header className="p-about__hero section band">
          <h1>{data.title}</h1>
          {data.mission && <p className="lead">{data.mission}</p>}
        </header>

        {data.history && (
          <div className="p-about__origin section band">
            <div className="rule--broken" aria-hidden="true" />
            <p className="p-about__history">{data.history}</p>
          </div>
        )}

        {data.aboutLong && (
          <div className="p-about__long section band">
            <p>{data.aboutLong}</p>
          </div>
        )}

        {features.length > 0 && (
          <section className="section band">
            <div className="section-head">
              <div className="rule--broken" aria-hidden="true" />
              <h2>Features</h2>
            </div>
            <div className="entry-grid">
              {features.map((f, i) => (
                <article className="entry" key={i}>
                  <div className="rule--broken rule--sm" aria-hidden="true" />
                  <h3>{f.title}</h3>
                  <p className="caption">{f.description}</p>
                </article>
              ))}
            </div>
          </section>
        )}

        {whatWeDo.length > 0 && (
          <section className="section band">
            <div className="section-head">
              <div className="rule--broken" aria-hidden="true" />
              <h2>What we do</h2>
            </div>
            <ul className="p-about__do">
              {whatWeDo.map((item, i) => (
                <li className="row" style={{ '--i': i }} key={i}>
                  {item}
                </li>
              ))}
            </ul>
          </section>
        )}

        {contact && (
          <section className="section">
            <div className="section-head">
              <div className="rule--broken" aria-hidden="true" />
              <h2>Say hello</h2>
            </div>

            <div className="p-about__contact">
              <div className="p-about__contact-details">
                {contact.location && (
                  <p className="caption">{contact.location}</p>
                )}
                {contact.email && (
                  <a className="p-about__email" href={`mailto:${contact.email}`}>
                    {contact.email}
                  </a>
                )}
                {contact.phone && <p className="meta">{contact.phone}</p>}
              </div>

              {socials.length > 0 && (
                <div className="entry-grid p-about__socials">
                  {socials.map((social, i) => (
                    <a
                      className="entry p-about__social row"
                      style={{ '--i': i }}
                      key={i}
                      href={social.href}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <div className="rule--broken rule--sm" aria-hidden="true" />
                      <span className="label">{social.label}</span>
                      {social.handle && (
                        <span className="p-about__handle">{social.handle}</span>
                      )}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </section>
  )
}

export default About
