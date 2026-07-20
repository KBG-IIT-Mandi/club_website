import React from 'react'
import { Link } from 'react-router-dom'
import "./NotFound.css"
import useDocumentTitle from '../../CustomHooks/useDocumentTitle'

/* Renders what NotFound.css already expected. This route is reachable in normal
   use, not only by typo: footer.json ships /contact and /privacy links and
   neither route exists — and we neither add routes nor edit that JSON. So this
   page is the only thing standing between the footer and a dead end.

   No club copy is invented here. "404" is a status code and "SEQUENCE NOT
   FOUND" is the sheet's own vocabulary for a missing sheet; neither is a claim
   about the club. */
const NotFound = () => {
  useDocumentTitle("Not Found")

  return (
    <div className="shell p-404">
      <p className="label label--live">Sequence not found</p>
      <p className="p-404__code">404</p>
      <div className="rule rule--broken p-404__rule" aria-hidden="true" />
      <p className="caption p-404__note">
        That sheet is not on this drawing.
      </p>
      <Link className="btn-ghost" to="/">Back to home</Link>
    </div>
  )
}

export default NotFound
