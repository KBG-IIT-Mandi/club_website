import React, { Suspense, lazy } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { LoadingSpinner } from "./Components/Loading";
import NavBar from "./Components/NavBar";
import Footer from "./Components/Footer/Footer";
import Grain from "./Components/Chrome/Grain";
import LabCursor from "./Components/Chrome/LabCursor";
import FocusShift from "./Components/Chrome/FocusShift";
import useKonami from "./CustomHooks/useKonami";
import Home from "./Pages/Home/Home";
import { loadRoute } from "./config/routes";
import "./App.css";

/* Home owns first paint. Every destination behind it is split into its own
   chunk and warmed on nav intent (NavBar.jsx), keeping the opening specimen
   light without making later navigation feel cold. */
const About = lazy(() => loadRoute("/about"));
const Team = lazy(() => loadRoute("/team"));
const Events = lazy(() => loadRoute("/events"));
const Projects = lazy(() => loadRoute("/projects"));
const Race = lazy(() => loadRoute("/race"));
const NotFound = lazy(() => loadRoute("*"));

export default function App() {
  // The mutation listener lives for the whole session, outside any route.
  useKonami();

  return (
    <Router>
      {/* First tab stop on every page. Visible only on focus (App.css). */}
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <NavBar />

      {/* FocusShift keys on the pathname: each route racks into focus. */}
      <main id="main" tabIndex={-1}>
        <FocusShift>
          <Suspense fallback={<LoadingSpinner />}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/about" element={<About />} />
              <Route path="/team" element={<Team />} />
              <Route path="/events" element={<Events />} />
              <Route path="/projects" element={<Projects />} />
              <Route path="/race" element={<Race />} />
              {/* The contact record lives on About. Preserve the intent as a
                  real deep link so the visitor lands at the record itself. */}
              <Route
                path="/contact"
                element={<Navigate to="/about#contact" replace />}
              />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </FocusShift>
      </main>

      {/* Outside <Routes>: closes every route; its fetch is cached, so
          navigation never refetches or remounts it. */}
      <Footer />

      {/* Overlays. Mounted last, painted above everything except the cursor. */}
      <Grain />
      <LabCursor />
    </Router>
  );
}
