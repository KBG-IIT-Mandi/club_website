import React from 'react'
import { Link } from 'react-router-dom'
import './NotFound.css'
import useDocumentTitle from '../../CustomHooks/useDocumentTitle'

/* Reachable in normal use, not only by typo: footer.json ships /contact and
   /privacy links and neither route exists — and we neither add routes nor
   edit that JSON. This page is a destination, not just an error.

   No club copy is invented here. "404" is a status code and the specimen
   vocabulary is the lab's own register for a missing record; neither is a
   claim about the club. */
const NotFound = () => {
  useDocumentTitle('Not Found')

  return (
    <div className="p-404 world-lab">
      <div className="shell p-404__inner">
        <p className="label">Error 404</p>

        <h1 className="display">Specimen not found</h1>

        {/* The empty petri dish. Pure CSS: two concentric rings and two small
            drifting cultures — static under reduced motion. Decorative only. */}
        <div className="p-404__dish" aria-hidden="true">
          <span className="p-404__dot" />
        </div>

        <p className="label p-404__note">
          The sample you requested is not in this archive
        </p>

        <Link className="btn-primary" to="/" data-cursor="explore">
          Return to the lab
        </Link>
      </div>
    </div>
  )
}

export default NotFound
