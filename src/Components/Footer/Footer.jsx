import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { API_ENDPOINTS, fetchData } from "../../config/api";
import "./Footer.css";

/* footer.json has existed, and API_ENDPOINTS.footer has been defined, the whole
   time — nothing ever fetched either. Every route simply ran out of content and
   ended in bare sheet.

   Live shape: { text: string, links: [{ label, href }] }. Those keys are used
   as-is; nothing here is invented and no key is added or renamed.

   The two live links point at /contact and /privacy, which are not routes. We
   neither add routes nor edit that JSON, so they land on NotFound — which is
   now a real page rather than a bare <div>, which is the only reason shipping
   them is acceptable. */
const Footer = () => {
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchData(API_ENDPOINTS.footer)
      .then((footerData) => {
        if (!cancelled) setData(footerData);
      })
      .catch((error) => {
        console.error("Failed to load footer data:", error);
        // No error surface here. A footer is not worth a SIGNAL LOST card on a
        // page whose own content loaded fine — it just does not render.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Same contract as every other surface: render nothing until data arrives.
  if (!data) return null;

  const links = Array.isArray(data.links) ? data.links : [];

  return (
    <footer className="foot">
      {/* Top edge is a strand broken at 71%, like every other edge. Not a border. */}
      <div className="foot__edge rule rule--broken rule--sm" aria-hidden="true" />

      <div className="shell foot__inner">
        {data.text && <p className="foot__text">{data.text}</p>}

        {!!links.length && (
          <nav className="foot__links">
            {links.map((link, i) => {
              if (!link || !link.href || !link.label) return null;

              // An internal href stays inside the router; anything else is a
              // real external link and gets the noopener/noreferrer pair.
              return link.href.startsWith("/") ? (
                <Link className="label foot__link" key={i} to={link.href}>
                  {link.label}
                </Link>
              ) : (
                <a
                  className="label foot__link"
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
    </footer>
  );
};

export default Footer;
