import React from "react";

export function SubsidyIcon({ kind = "home", size = 24 }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  if (kind === "people") return <svg {...common}><circle cx="9" cy="8" r="3" /><path d="M3 21v-2a6 6 0 0 1 12 0v2" /><path d="M16 4a3 3 0 0 1 0 6" /><path d="M21 21v-2a6 6 0 0 0-3.5-5.5" /></svg>;
  if (kind === "percent") return <svg {...common}><path d="M19 5 5 19" /><circle cx="6.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" /></svg>;
  if (kind === "building") return <svg {...common}><path d="M4 21h16" /><path d="M6 21V5l6-3 6 3v16" /><path d="M9 9h.01M15 9h.01M9 13h.01M15 13h.01" /></svg>;
  if (kind === "users") return <svg {...common}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
  if (kind === "coins") return <svg {...common}><ellipse cx="12" cy="5" rx="7" ry="3" /><path d="M5 5v7c0 1.66 3.13 3 7 3s7-1.34 7-3V5" /><path d="M5 12v7c0 1.66 3.13 3 7 3s7-1.34 7-3v-7" /></svg>;
  if (kind === "link") return <svg {...common}><path d="M10 13a5 5 0 0 0 7.07.07l2-2a5 5 0 0 0-7.07-7.07l-1.15 1.15" /><path d="M14 11a5 5 0 0 0-7.07-.07l-2 2A5 5 0 0 0 12 20l1.15-1.15" /></svg>;
  return <svg {...common}><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V10Z" /><path d="M9 21v-6h6v6" /></svg>;
}
