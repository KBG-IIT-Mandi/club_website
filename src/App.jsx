import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import NavBar from "./Components/NavBar";
import Footer from "./Components/Footer/Footer";
import Grain from "./Components/Chrome/Grain";
import LabCursor from "./Components/Chrome/LabCursor";
import FocusShift from "./Components/Chrome/FocusShift";
import useKonami from "./CustomHooks/useKonami";
import Home from "./Pages/Home/Home";
import About from "./Pages/About/About";
import Team from "./Pages/Team/Team";
import Events from "./Pages/Events/Events";
import Projects from "./Pages/Projects/Projects";
import NotFound from "./Pages/NotFound/NotFound";
import "./App.css";

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
      <main id="main">
        <FocusShift>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/about" element={<About />} />
            <Route path="/team" element={<Team />} />
            <Route path="/events" element={<Events />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
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
