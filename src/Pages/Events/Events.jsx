import React, { useCallback, useEffect, useState } from "react";
import "./Events.css";
import useDocumentTitle from "../../CustomHooks/useDocumentTitle";
import useDrawOnScroll from "../../CustomHooks/useDrawOnScroll";
import { API_ENDPOINTS, fetchData } from "../../config/api";
import { LoadingSpinner, ErrorState } from "../../Components/Loading";

/* The four membrane silhouettes cycle by index so adjacent samples never
   share an outline. Variant 1 is the bare primitive (App.css). */
const MEMBRANES = [
  "membrane",
  "membrane membrane--2",
  "membrane membrane--3",
  "membrane membrane--4",
];

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

  /* The reveal system lives in useDrawOnScroll. One observer, no threshold
     (a threshold deadlocks .band — see the hook). This page has one fetch and
     early-returns until it lands, so `!!data` changes exactly when the
     .band/.row targets first exist — nothing arrives after arming. */
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

  /* Section names are the lab's own vocabulary for the JSON's own keys:
     upcoming samples are LIVE, past samples go to THE FREEZER. */
  const groups = [
    {
      key: "upcoming",
      heading: "Live samples",
      live: true,
      items: Array.isArray(data.upcoming) ? data.upcoming : [],
    },
    {
      key: "past",
      heading: "The freezer",
      live: false,
      items: Array.isArray(data.past) ? data.past : [],
    },
  ];

  /* date is a RAW STRING in mixed formats ("2026", "2025-11-20").
     Rendered verbatim on the tag — never parsed, never reformatted. */
  const renderSample = (event, i, live, key) => (
    <li className="sample row" style={{ "--i": i % 4 }} key={`${key}-${i}`}>
      <div className="sample__specimen">
        <p className={live ? "tag tag--live" : "tag"}>
          {live ? "SAMPLE" : "ARCHIVED"}
          {event.date ? ` ${event.date}` : ""}
        </p>
        {event.image && (
          <div
            className={`sample__dish ${MEMBRANES[i % MEMBRANES.length]}`}
            aria-hidden="true"
          >
            <img src={event.image} alt="" loading="lazy" decoding="async" />
          </div>
        )}
      </div>

      {(event.title || event.description) && (
        <div className="sample__body world-journal">
          {event.title && <h3 className="sample__title">{event.title}</h3>}
          {event.description && (
            <p className="sample__desc">{event.description}</p>
          )}
        </div>
      )}
    </li>
  );

  return (
    <div className="p-events world-lab" ref={rootRef}>
      <div className="shell">
        <header className="events-head band">
          <p className="label">The sample log</p>
          <h1>{data.title || "Events"}</h1>
        </header>

        {groups.map(
          ({ key, heading, live, items }) =>
            items.length > 0 && (
              <section className="section" key={key}>
                <div className="section-head band">
                  <h2>{heading}</h2>
                  <div
                    className={live ? "rule rule--live" : "rule"}
                    aria-hidden="true"
                  />
                </div>

                {/* Display order is JSON order. past[] is not chronologically
                    sorted in the source and we do not reorder the club's data. */}
                <ol className="sample-list">
                  {items.map((event, i) => renderSample(event, i, live, key))}
                </ol>
              </section>
            )
        )}
      </div>
    </div>
  );
}
