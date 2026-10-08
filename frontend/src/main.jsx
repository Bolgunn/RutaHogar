import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles.css";
import "./components/user-home.css";
import "./components/home-news.css";
import "./components/user-results.css";
import "./components/user-profile.css";
import "./components/user-view-consistency.css";

createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);
