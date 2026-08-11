import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { API_ENDPOINTS, fetchData } from "../../config/api";
import "./Footer.css";

/* The footer is the lab's telemetry block: station coordinates, the last
   signal from the content repo, and the small print from footer.json.

   footer.json live shape: { text: string, links: [{ label, href }] }. Those
   keys are used as-is; nothing is invented and no key is added or renamed.
   The two live links point at /contact and /privacy, which are not routes —
   they land on NotFound, which is a real page, so shipping them is fine. */

const LINKS_REPO_COMMITS =
  "https://api.github.com/repos/KBG-IIT-Mandi/KBG_Links/commits?per_page=1";

/* "8 DAYS AGO" from an ISO date. Mono register, so uppercase and terse. */
const relativeSignal = (iso) => {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 60) return `${mins} MIN AGO`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} HR AGO`;
  const days = Math.round(hours / 24);
  return `${days} DAYS AGO`;
};

const Footer = () => {
  const [data, setData] = useState(null);
  const [signal, setSignal] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchData(API_ENDPOINTS.footer)
      .then((footerData) => {
        if (!cancelled) setData(footerData);
      })
      .catch((error) => {
        console.error("Failed to load footer data:", error);
        // A footer is not worth a SIGNAL LOST card — it just does not render.
      });

    // The content-repo pulse. Strictly decorative telemetry: fail-silent,
    // row hidden when the API is unreachable or rate-limited.
    fetchData(LINKS_REPO_COMMITS)
      .then((commits) => {
        if (cancelled || !Array.isArray(commits) || !commits[0]) return;
        const iso = commits[0]?.commit?.committer?.date;
        const rel = iso ? relativeSignal(iso) : null;
        if (rel) setSignal(rel);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  if (!data) return null;

  const links = Array.isArray(data.links) ? data.links : [];

  return (
    <footer className="foot world-lab">
      <div className="foot__edge" aria-hidden="true" />

      <div className="shell foot__inner">
        <div className="foot__telemetry">
          <p className="foot__row foot__row--name">KAMAND BIOENGINEERING GROUP</p>
          <p className="foot__row">31.7754°N 76.9861°E · IIT MANDI · HIMACHAL PRADESH</p>
          {signal && (
            <p className="foot__row">
              LAST SIGNAL <span className="foot__signal">{signal}</span>
            </p>
          )}
          {/* The lab log signs off the way it opened — SPECIMEN 001. */}
          <p className="foot__row foot__row--end">
            SPECIMEN 001 · TRANSMISSION ENDS
          </p>
        </div>

        <div className="foot__small">
          {data.text && <p className="foot__text">{data.text}</p>}

          {!!links.length && (
            <nav className="foot__links">
              {links.map((link, i) => {
                if (!link || !link.href || !link.label) return null;
                return link.href.startsWith("/") ? (
                  <Link className="foot__link" key={i} to={link.href}>
                    {link.label}
                  </Link>
                ) : (
                  <a
                    className="foot__link"
                    key={i}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {link.label}
                  </a>
                );
              })}
            </nav>
          )}
        </div>
      </div>
    </footer>
  );
};

export default Footer;
