import { useCallback, useEffect, useState } from "react";
import { API_ENDPOINTS, fetchData } from "../../config/api";
import { LoadingSpinner, ErrorState } from "../../Components/Loading";
import useDocumentTitle from "../../CustomHooks/useDocumentTitle";
import useDrawOnScroll from "../../CustomHooks/useDrawOnScroll";
import "./Team.css";

export default function Team() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // Indices whose remote photo failed to load. The frame keeps its box either
  // way, so a 404 recolours the cell — it never reflows the grid.
  const [brokenPhotos, setBrokenPhotos] = useState(() => new Set());

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
  }, [load]);

  /* The reveal system lives in useDrawOnScroll. One observer, no threshold
     (a threshold deadlocks .band — see the hook), and no per-page options.
     The grid is a single band (move 2), so seven cards plot as one
     left-to-right wipe rather than seven competing reveals. */
  const pageRef = useDrawOnScroll(!!data);

  const markPhotoBroken = (index) => {
    setBrokenPhotos((prev) => {
      if (prev.has(index)) return prev;
      const next = new Set(prev);
      next.add(index);
      return next;
    });
  };

  if (loading) {
    return <LoadingSpinner variant="ring" />;
  }

  if (error || !data) {
    return (
      <ErrorState
        message="Could not reach the team roster. Check your connection and try again."
        onRetry={load}
      />
    );
  }

  // Guarded: a members-less payload renders a header, never a thrown page.
  const members = Array.isArray(data.members) ? data.members : [];

  return (
    /* The ref goes on the page ROOT, not on the band: the hook collects its
       targets with root.querySelectorAll(), which never matches the root
       element itself. A ref on the band would arm the reveal and then find
       nothing to draw — clipping the grid permanently. */
    <div className="p-team" ref={pageRef}>
      <div className="shell section">
        <header className="section-head">
          <div className="rule--broken" aria-hidden="true" />
          <h1>{data.title || "Team"}</h1>
        </header>

        {!!members.length && (
          <div className="entry-grid band">
            {members.map((m, i) => {
              // Iterate the socials object generically. Hardcoding github +
              // linkedin is what dropped instagram for 3 members and left one
              // card with an empty links row.
              const socials = Object.entries(m.socials || {}).filter(
                ([, href]) => typeof href === "string" && href.trim() !== ""
              );

              return (
                <article className="entry team-member" key={m.name || i}>
                  <div className="rule--broken rule--sm" aria-hidden="true" />

                  <div className="team-photo">
                    {!brokenPhotos.has(i) && m.image && (
                      <img
                        src={m.image}
                        alt={m.name || ""}
                        width="320"
                        height="320"
                        loading="lazy"
                        decoding="async"
                        onError={() => markPhotoBroken(i)}
                      />
                    )}
                  </div>

                  {m.role && <p className="label">{m.role}</p>}
                  {m.name && <h3>{m.name}</h3>}
                  {m.bio && <p className="team-bio">{m.bio}</p>}

                  {!!socials.length && (
                    <div className="entry-foot team-links">
                      {socials.map(([key, href]) => (
                        <a
                          className="label team-link"
                          key={key}
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {key}
                          <span className="sr-only"> — {m.name}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
