import React, { useCallback, useEffect, useState } from "react";
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
    <main className="p-team world-lab" ref={pageRef}>
      <section className="section">
        <div className="shell">
          <div className="section-head band">
            <p className="label label--live">THE CONSTELLATION</p>
            <h1>{data.title || "Our Team"}</h1>
            <p className="lead">
              Every researcher, project and discipline is a node in one living
              network. Hover a star to see what it touches.
            </p>
          </div>

          <Constellation members={members} projects={projects} />
        </div>
      </section>
    </main>
  );
}
