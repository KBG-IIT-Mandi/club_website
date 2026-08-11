import React, { useCallback, useEffect, useLayoutEffect, useState } from "react";
import "./Team.css";
import useDocumentTitle from "../../CustomHooks/useDocumentTitle";
import useDrawOnScroll from "../../CustomHooks/useDrawOnScroll";
import { API_ENDPOINTS, fetchData } from "../../config/api";
import { LoadingSpinner, ErrorState } from "../../Components/Loading";
import Constellation from "../../Components/Constellation/Constellation";

/* ═══════════════════════════════════════════════════════════════════════════
   TEAM — THE CONSTELLATION.
   team.json is the page; projects.json only enriches the graph with project
   nodes and edges, so its failure is silent — the constellation simply has
   fewer stars, and the roster grid is always the accessible record.

   Motion is a GSAP enhancement chunk (teamMotion.js): scramble-in eyebrow,
   SplitText title, census count-up, stage focus rack, roster cascade,
   magnetic card tilt. The page ARMS [data-team-motion] before paint (CSS
   hides the choreographed elements) and the chunk takes ownership; under
   prefers-reduced-motion, JS failure, or a slow chunk the safety timeout
   drops the attribute and the page is simply... a page. Content never
   gates on choreography.
   ═══════════════════════════════════════════════════════════════════════════ */

export default function Team() {
  const [data, setData] = useState(null);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useDocumentTitle(data?.title || "Team");

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const teamData = await fetchData(API_ENDPOINTS.team);
      setData(teamData);
    } catch (err) {
      console.error("Failed to load team data:", err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    fetchData(API_ENDPOINTS.projects)
      .then((d) => setProjects(Array.isArray(d?.projects) ? d.projects : []))
      .catch(() => {});
  }, [load]);

  const pageRef = useDrawOnScroll(`${!!data}-${projects.length}`);

  /* Arm the choreography gate BEFORE paint, only when motion is wanted.
     The layout effect runs on every data change; arming is idempotent and
     teamMotion drops the attribute the moment it takes ownership. */
  const ready = !loading && !error && !!data;
  useLayoutEffect(() => {
    const el = pageRef.current;
    if (!el || !ready) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return undefined;
    }

    el.setAttribute("data-team-motion", "");
    /* safety: if the chunk never lands, un-hide everything */
    const bail = setTimeout(() => el.removeAttribute("data-team-motion"), 1800);

    let dispose = null;
    let cancelled = false;
    import("./teamMotion.js")
      .then((m) => {
        clearTimeout(bail);
        if (cancelled) return;
        dispose = m.initTeamMotion(el);
      })
      .catch(() => {
        clearTimeout(bail);
        el.removeAttribute("data-team-motion");
      });

    return () => {
      cancelled = true;
      clearTimeout(bail);
      if (dispose) dispose();
      el.removeAttribute("data-team-motion");
    };
    // pageRef is a stable ref object from useDrawOnScroll
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  if (loading) {
    return <LoadingSpinner variant="dna" />;
  }

  if (error || !data) {
    return (
      <ErrorState
        message="The constellation did not arrive. Check your connection and try again."
        onRetry={load}
      />
    );
  }

  const members = Array.isArray(data.members) ? data.members.filter(Boolean) : [];

  return (
    <div className="p-team world-lab" ref={pageRef}>
      <section className="section">
        <div className="shell">
          <div className="section-head band">
            <p className="label label--live team-eyebrow">THE CONSTELLATION</p>
            <h1>{data.title || "Our Team"}</h1>
            <p className="lead team-lead">
              Every researcher, project and discipline is a node in one living
              network. Hover a star to see what it touches.
            </p>
            {members.length > 0 && (
              <p className="team-stats">
                <span className="label">
                  <b className="team-stats__num" data-value={members.length}>
                    {members.length}
                  </b>{" "}
                  {members.length === 1 ? "RESEARCHER" : "RESEARCHERS"}
                </span>
                {projects.length > 0 && (
                  <span className="label">
                    <b className="team-stats__num" data-value={projects.length}>
                      {projects.length}
                    </b>{" "}
                    ACTIVE {projects.length === 1 ? "PROJECT" : "PROJECTS"}
                  </span>
                )}
                <span className="label label--live">ONE ORGANISM</span>
              </p>
            )}
          </div>

          <Constellation members={members} projects={projects} />
        </div>
      </section>
    </div>
  );
}
