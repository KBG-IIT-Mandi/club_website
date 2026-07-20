import React, { useCallback, useEffect, useState } from "react";
import "./Events.css";
import useDocumentTitle from "../../CustomHooks/useDocumentTitle";
import useDrawOnScroll from "../../CustomHooks/useDrawOnScroll";
import { API_ENDPOINTS, fetchData } from "../../config/api";
import { LoadingSpinner, ErrorState } from "../../Components/Loading";

export default function Events() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useDocumentTitle(data?.title || "Events");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const eventsData = await fetchData(API_ENDPOINTS.events);
        if (!cancelled) setData(eventsData);
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  /* THE ENTIRE MOTION SYSTEM: one IntersectionObserver adds .is-drawn; CSS does
     the rest. Bands plot left-to-right (move 2), rows draw with scaleX (move 3).
     No rAF, no scroll listener, no library. If IO is unavailable the content is
     marked drawn immediately — nothing is ever hidden behind a reveal that never
     fires. prefers-reduced-motion is handled in CSS: .band/.row rest at final. */
  /* The reveal system lives in useDrawOnScroll. One observer, no threshold
     (a threshold deadlocks .band — see the hook), and no per-page options. */
  const rootRef = useDrawOnScroll(!!data);

  if (loading) return <LoadingSpinner variant="dna" />;

  if (error) {
    return (
      <ErrorState
        message="Failed to load events data. Please try again later."
        onRetry={retry}
      />
    );
  }

  if (!data) return null;

  /* Section names are the JSON's own keys, not invented editorial copy.
     events.json carries no heading field, so the structure names itself. */
  const groups = [
    { key: "upcoming", heading: "Upcoming", live: true, items: data.upcoming || [] },
    { key: "past", heading: "Past", live: false, items: data.past || [] },
  ];

  const renderEntry = (event, i, live, key) => (
    <li className={`entry row${live ? " entry--live" : ""}`} key={`${key}-${i}`}>
      {/* The top rail. Broken at 71% — the shield. Hover closes it (the clasp);
          App.css wires that for any .rule--broken inside an .entry. */}
      <div className="rule--broken rule--sm" aria-hidden="true" />

      <div className="event">
        {event.image && (
          <img
            className="event__poster"
            src={event.image}
            alt=""
            width="168"
            height="168"
            loading="lazy"
            decoding="async"
          />
        )}

        <div className="event__body">
          {/* date is a RAW STRING in mixed formats ("2026", "2025-11-20").
              Rendered verbatim — never parsed, never reformatted. */}
          {event.date && (
            <p className={`label${live ? " label--live" : ""}`}>{event.date}</p>
          )}
          {event.title && <h3>{event.title}</h3>}
          {event.description && <p className="event__desc">{event.description}</p>}
        </div>
      </div>
    </li>
  );

  return (
    <div className="p-events" ref={rootRef}>
      <div className="shell">
        <header className="events-head">
          <h1>{data.title || "Events"}</h1>
        </header>

        {groups.map(
          ({ key, heading, live, items }) =>
            items.length > 0 && (
              <section className="section" key={key}>
                <div className="section-head">
                  <div
                    className={`rule--broken band${live ? " rule--live" : ""}`}
                    aria-hidden="true"
                  />
                  <h2>{heading}</h2>
                </div>

                {/* Display order is JSON order. past[] is not chronologically
                    sorted in the source and we do not reorder the club's data. */}
                <ol className="entry-list">
                  {items.map((event, i) => renderEntry(event, i, live, key))}
                </ol>
              </section>
            )
        )}
      </div>
    </div>
  );
}
