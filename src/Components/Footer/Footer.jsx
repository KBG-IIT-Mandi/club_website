import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { API_ENDPOINTS, fetchData } from "../../config/api";
import "./Footer.css";

/* The footer is the lab's telemetry block: station coordinates, the last
   signal from the content repo, and the small print from footer.json.

   footer.json live shape: { text: string, links: [{ label, href }] }. Those
   keys are used as-is; nothing is invented and no key is added or renamed.
   Global chrome has a local fallback: losing the content network should never
   remove the site's final wayfinding surface. */

const DEFAULT_FOOTER = {
  text: 'Kamand Bioengineering Group · IIT Mandi',
  links: [{ label: 'Contact', href: '/about#contact' }],
};

const INTERNAL_ROUTES = new Set([
  '/',
  '/about',
  '/team',
  '/events',
  '/projects',
  '/race',
  '/contact',
]);

const internalHref = (href) =>
  href === '/contact' ? '/about#contact' : href;

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
  const [data, setData] = useState(DEFAULT_FOOTER);
  const [signal, setSignal] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchData(API_ENDPOINTS.footer)
      .then((footerData) => {
        if (!cancelled) setData(footerData);
      })
      .catch((error) => {
        console.error("Failed to load footer data:", error);
        setData(DEFAULT_FOOTER);
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
            <nav className="foot__links" aria-label="Footer">
              {links.map((link, i) => {
                if (!link || !link.href || !link.label) return null;
                if (link.href.startsWith("/")) {
                  const path = link.href.split(/[?#]/)[0];
                  /* Content may advertise a page before the application ships
                     it. Do not turn global footer navigation into a 404 link. */
                  if (!INTERNAL_ROUTES.has(path)) return null;
                  return (
                    <Link
                      className="foot__link"
                      key={`${link.href}-${i}`}
                      to={internalHref(link.href)}
                    >
                      {link.label}
                    </Link>
                  );
                }
                return (
                  <a
                    className="foot__link"
                    key={`${link.href}-${i}`}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${link.label} (opens in a new tab)`}
                  >
                    {link.label}
                    <span className="foot__external" aria-hidden="true">↗</span>
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
