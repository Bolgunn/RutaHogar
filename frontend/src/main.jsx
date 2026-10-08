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
import "./components/user-subsidies.css";
import "./components/user-page-headers.css";
import "./components/user-improvement-plan.css";
import "./components/user-academy.css";
import "./components/user-notices.css";
import "./components/user-exploration.css";
import "./components/user-design-system.css";
import "./components/executive-leads.css";
import "./components/staff-view-consistency.css";
import "./components/notification-toast.css";

createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);
