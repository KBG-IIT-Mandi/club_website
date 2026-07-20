import React, { useEffect, useState } from "react";
import "./Projects.css";
import useDocumentTitle from "../../CustomHooks/useDocumentTitle";
import useDrawOnScroll from "../../CustomHooks/useDrawOnScroll";
import { API_ENDPOINTS, fetchData } from "../../config/api";
import { LoadingSpinner, ErrorState } from "../../Components/Loading";

const Projects = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // data.title is the source of truth; the fallback is a tab label, not club copy.
  useDocumentTitle(data?.title || "Projects");

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      setLoading(true);
      setError(false);
      try {
        const projectsData = await fetchData(API_ENDPOINTS.projects);
        if (!cancelled) setData(projectsData);
      } catch (err) {
        console.error("Failed to load projects data:", err);
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadData();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // THE REVEAL — the entire system. One IntersectionObserver adds .is-drawn;
  // CSS transitions do the rest. Bands plot left-to-right (clip-path),
  // rows draw out from the left rule (scaleX), staggered via --i.
  // A reduced preference is honoured in CSS: every target renders at its
  // final state, because each move here is a final state minus a transform.
  /* The reveal system lives in useDrawOnScroll. One observer, no threshold
     (a threshold deadlocks .band — see the hook), and no per-page options. */
  const pageRef = useDrawOnScroll(!!data);

  if (loading) {
    return <LoadingSpinner variant="dna" />;
  }

  if (error || !data) {
    return (
      <ErrorState
        message="Failed to load projects data. Please try again later."
        onRetry={() => setAttempt((n) => n + 1)}
      />
    );
  }

  const projects = Array.isArray(data.projects) ? data.projects : [];

  return (
    <div className="p-projects" ref={pageRef}>
      <section className="shell section">
        <header className="section-head band">
          {data.title && <h1>{data.title}</h1>}
          <div className="rule--broken" aria-hidden="true" />
        </header>

        {!!projects.length && (
          <div className="entry-grid">
            {projects.map((p, i) => {
              const tech = Array.isArray(p.tech) ? p.tech : [];
              return (
                <article className="entry row" key={p.name || i} style={{ "--i": i }}>
                  <div className="rule--broken rule--sm" aria-hidden="true" />
                  <h2>{p.name}</h2>
                  {p.summary && <p className="project-summary">{p.summary}</p>}
                  {!!tech.length && (
                    <div className="tag-row entry-foot">
                      {tech.map((t, j) => (
                        <span className="tag" key={j}>
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

export default Projects;
