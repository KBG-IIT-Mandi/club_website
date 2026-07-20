import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import NavBar from "./Components/NavBar";
import Footer from "./Components/Footer/Footer";
import HelixField from "./Components/Background/HelixField";
import Sheet from "./Components/Sheet/Sheet";
import Home from "./Pages/Home/Home";
import About from "./Pages/About/About";
import Team from "./Pages/Team/Team";
import Events from "./Pages/Events/Events";
import Projects from "./Pages/Projects/Projects";
import NotFound from "./Pages/NotFound/NotFound";
import "./App.css";




export default function App() {
  return (
    <Router>
      {/* The ground. Both mounted once, outside <Routes>, so they survive
          navigation. HelixField (the 3D shader) renders first/behind; Sheet
          (grid, gear, frame) draws the engineering over it. */}
      <HelixField />
      <Sheet />
      <NavBar />

      {/* Normal React Router rendering */}
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/team" element={<Team />} />
          <Route path="/events" element={<Events />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>

      {/* Outside <Routes>, like <Sheet />: it closes every route, and its own
          fetch is cached, so navigation never refetches or remounts it. */}
      <Footer />
    </Router>
  );
}
