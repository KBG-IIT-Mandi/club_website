import React, { useEffect, useMemo, useState } from "react";
import "./Projects.css";
import useDocumentTitle from "../../CustomHooks/useDocumentTitle";
import useDrawOnScroll from "../../CustomHooks/useDrawOnScroll";
import { API_ENDPOINTS, fetchData } from "../../config/api";
import { LoadingSpinner, ErrorState } from "../../Components/Loading";
import SpecimenCard from "../../Components/SpecimenCard/SpecimenCard";
import { disciplineFor } from "../../lib/discipline";

/* ═══════════════════════════════════════════════════════════════════════════
   PROJECTS — THE ARCHIVE.
   Every project is a specimen dossier (SpecimenCard). The filter row is
   DERIVED from the live data: only disciplines that actually occur become
   chips, so an empty category can never render an empty archive.
   ═══════════════════════════════════════════════════════════════════════════ */

const Projects = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState("all");
  const [openIndex, setOpenIndex] = useState(-1);

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

  const pageRef = useDrawOnScroll(!!data);

  const projects = useMemo(
    () => (Array.isArray(data?.projects) ? data.projects.filter(Boolean) : []),
    [data]
  );

  /* Chips: ALL + each discipline present in the live data, in first-seen
     order. Indices are preserved from the ARCHIVE order — EXPERIMENT numbers
     never renumber when a filter narrows the view. */
  const disciplines = useMemo(() => {
    const seen = new Map();
    projects.forEach((p) => {
      const d = disciplineFor(p.tech);
      if (!seen.has(d.id)) seen.set(d.id, d.label);
    });
    return Array.from(seen, ([id, label]) => ({ id, label }));
  }, [projects]);

  const visible = useMemo(
    () =>
      projects
        .map((p, i) => ({ project: p, index: i }))
        .filter(({ project }) => filter === "all" || disciplineFor(project.tech).id === filter),
    [projects, filter]
  );

  if (loading) {
    return <LoadingSpinner variant="dna" />;
  }

  if (error || !data) {
    return (
      <ErrorState
        message="The archive did not arrive. Check your connection and try again."
        onRetry={() => setAttempt((a) => a + 1)}
      />
    );
  }

  return (
    <main className="p-projects world-lab" ref={pageRef}>
      <section className="section">
        <div className="shell">
          <div className="section-head band">
            <p className="label label--live">THE ARCHIVE</p>
            <h1>{data.title || "Projects"}</h1>
            <p className="lead">
              Every project is a running experiment. Open a dossier to read the
              full record.
            </p>
          </div>

          {disciplines.length > 1 && (
            <div
              className="archive-filter tag-row band"
              role="group"
              aria-label="Filter by discipline"
            >
              <button
                type="button"
                className={`tag archive-filter__chip${filter === "all" ? " is-active" : ""}`}
                aria-pressed={filter === "all"}
                onClick={() => setFilter("all")}
                data-cursor="explore"
              >
                ALL ({projects.length})
              </button>
              {disciplines.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className={`tag archive-filter__chip${filter === d.id ? " is-active" : ""}`}
                  aria-pressed={filter === d.id}
                  onClick={() => setFilter(d.id)}
                  data-cursor="explore"
                >
                  {d.label}
                </button>
              ))}
            </div>
          )}

          <div className="archive-list">
            {visible.map(({ project, index }) => (
              <SpecimenCard
                key={project.name || index}
                project={project}
                index={index}
                expanded={openIndex === index}
                onToggle={() => setOpenIndex((cur) => (cur === index ? -1 : index))}
              />
            ))}
          </div>

          {!visible.length && (
            <p className="label archive-empty">NO SPECIMENS UNDER THIS DISCIPLINE</p>
          )}
        </div>
      </section>
    </main>
  );
};

export default Projects;
