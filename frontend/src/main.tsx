import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, NavLink, Route, Routes } from "react-router-dom";
import LogExplorer from "./App";
import RabbitExtractor from "./components/RabbitExtractor";
import "./styles.css";

function Root() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  return (
    <div className="app-root" data-theme={theme}>
      <nav className="navbar" aria-label="Navegación principal">
        <NavLink to="/" className="navbar__brand">
          <div className="navbar__brand-icon" aria-hidden="true">📊</div>
          LogsKibana
        </NavLink>

        <div className="navbar__nav">
          <NavLink
            to="/"
            end
            className={({ isActive }) => `navbar__link${isActive ? " active" : ""}`}
          >
            🔍 Explorer
          </NavLink>
          <NavLink
            to="/rabbit"
            className={({ isActive }) => `navbar__link${isActive ? " active" : ""}`}
          >
            🐇 RabbitMQ
          </NavLink>
        </div>

        <div className="navbar__spacer" />

        <button
          className="theme-toggle"
          onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
          title={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
          aria-label="Cambiar tema"
        >
          {theme === "dark" ? "☀" : "🌙"}
        </button>
      </nav>

      <Routes>
        <Route path="/"       element={<LogExplorer />} />
        <Route path="/rabbit" element={<RabbitExtractor />} />
      </Routes>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Root />
    </BrowserRouter>
  </React.StrictMode>
);
