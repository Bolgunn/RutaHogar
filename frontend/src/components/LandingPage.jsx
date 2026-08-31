import React, { useState, useEffect, useCallback } from "react";

export const landingStyles = `
/* ═══ Landing Navy/Gold ═══ */
.lp * { box-sizing: border-box; margin: 0; padding: 0; }
.lp {
  font-family: var(--rh-font);
  color: var(--rh-text);
  background: var(--rh-bg);
  scroll-behavior: smooth;
}

/* ── Nav ── */
.lp-nav {
  position: sticky; top: 0; z-index: 100;
  display: flex; justify-content: space-between; align-items: center;
  padding: 0 2.5rem; height: 72px;
  background: rgba(255,255,255,0.95); backdrop-filter: blur(16px) saturate(1.2);
  border-bottom: 1px solid rgba(11,26,46,0.06);
  box-shadow: 0 1px 3px rgba(11,26,46,0.04);
}
.lp-nav-brand { display: flex; align-items: center; text-decoration: none; flex-shrink: 0; }
.lp-nav-brand-logo { height: 44px; width: auto; }
.lp-nav-right { display: flex; align-items: center; gap: 0; margin-left: auto; }
.lp-nav-tab {
  font-size: 14px; font-weight: 500; color: rgba(11,26,46,0.55);
  text-decoration: none; background: none; border: none; border-bottom: 2px solid transparent;
  cursor: pointer; font-family: var(--rh-font); padding: 24px 18px 22px;
  transition: color 0.2s, border-color 0.2s; white-space: nowrap;
}
.lp-nav-tab:hover { color: var(--rh-navy-deep); }
.lp-nav-tab.is-active { color: var(--rh-navy-deep); font-weight: 600; border-bottom-color: var(--rh-gold); }
.lp-nav-cta {
  background: linear-gradient(135deg, var(--rh-gold) 0%, var(--rh-gold-dark) 100%);
  color: var(--rh-navy-deep);
  padding: 10px 22px; border-radius: 8px;
  font-size: 13px; font-weight: 700; border: none; cursor: pointer;
  font-family: var(--rh-font); transition: all 0.2s ease;
  margin-left: 8px; white-space: nowrap;
  box-shadow: 0 2px 8px rgba(212,168,67,0.2);
}
.lp-nav-cta:hover { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(212,168,67,0.3); }

/* ── Hero ── */
.lp-hero {
  background: linear-gradient(165deg, var(--rh-navy-deep) 0%, #0F2240 45%, var(--rh-navy-mid) 100%);
  padding: 5rem 2.5rem 4.5rem; position: relative; overflow: hidden;
  min-height: 72vh; display: flex; align-items: center;
}
.lp-hero::before {
  content: ''; position: absolute; top: -200px; right: -200px;
  width: 600px; height: 600px; border-radius: 50%;
  background: radial-gradient(circle, rgba(212,168,67,0.10) 0%, transparent 70%);
  animation: lp-hero-glow 8s ease-in-out infinite alternate;
}
@keyframes lp-hero-glow {
  0% { transform: scale(1); opacity: 0.8; }
  100% { transform: scale(1.1); opacity: 1; }
}
.lp-hero::after {
  content: ''; position: absolute; bottom: -150px; left: -100px;
  width: 400px; height: 400px; border-radius: 50%;
  background: radial-gradient(circle, rgba(212,168,67,0.05) 0%, transparent 70%);
}
.lp-hero-grid-pattern {
  position: absolute; inset: 0; opacity: 0.03;
  background-image:
    linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px);
  background-size: 60px 60px;
}

.lp-hero-inner {
  max-width: 1120px; margin: 0 auto; width: 100%;
  display: grid; grid-template-columns: 1fr 1fr; gap: 4rem;
  align-items: center; position: relative; z-index: 2;
}
.lp-hero-eyebrow {
  display: inline-flex; align-items: center; gap: 8px;
  background: rgba(212,168,67,0.10); border: 1px solid rgba(212,168,67,0.20);
  border-radius: 999px; padding: 6px 16px;
  font-size: 11px; font-weight: 700; letter-spacing: 0.1em;
  text-transform: uppercase; color: var(--rh-gold); margin-bottom: 1.5rem;
}
.lp-hero-dot {
  width: 6px; height: 6px; border-radius: 50%; background: var(--rh-gold);
  animation: lp-blink 2s ease-in-out infinite;
}
@keyframes lp-blink { 0%,100%{opacity:1} 50%{opacity:0.3} }

.lp-hero h1 {
  font-family: var(--rh-font-display); font-size: clamp(38px,4.5vw,58px);
  font-weight: 400; color: #fff; line-height: 1.08; letter-spacing: -0.5px;
  margin-bottom: 1.25rem;
}
.lp-hero h1 .gold { color: var(--rh-gold); }
.lp-hero-sub { font-size: 16px; color: rgba(255,255,255,0.55); line-height: 1.7; margin-bottom: 2rem; max-width: 440px; }
.lp-hero-actions { display: flex; gap: 12px; flex-wrap: wrap; }
.lp-hero-btn-primary {
  background: linear-gradient(135deg, var(--rh-gold) 0%, var(--rh-gold-dark) 100%);
  color: var(--rh-navy-deep);
  padding: 14px 28px; border-radius: 10px; font-size: 15px; font-weight: 700;
  border: none; cursor: pointer; font-family: var(--rh-font);
  transition: all 0.25s ease;
  display: inline-flex; align-items: center; gap: 8px;
  box-shadow: 0 4px 20px rgba(212,168,67,0.3);
}
.lp-hero-btn-primary:hover { transform: translateY(-2px); box-shadow: 0 8px 32px rgba(212,168,67,0.4); }
.lp-hero-btn-primary:active { transform: translateY(0); }
.lp-hero-btn-outline {
  background: rgba(255,255,255,0.04); color: rgba(255,255,255,0.8);
  padding: 14px 28px; border-radius: 10px; font-size: 15px; font-weight: 600;
  border: 1px solid rgba(255,255,255,0.15); cursor: pointer;
  font-family: var(--rh-font); transition: all 0.2s ease;
  backdrop-filter: blur(8px);
}
.lp-hero-btn-outline:hover { background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.3); color: #fff; }

/* ── Score Card (hero right) ── */
.lp-score-card {
  background: rgba(255,255,255,0.06); backdrop-filter: blur(24px) saturate(1.3);
  border: 1px solid rgba(212,168,67,0.2); border-radius: 20px;
  padding: 1.75rem; position: relative; overflow: hidden;
  box-shadow: 0 8px 32px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.08);
}
.lp-score-card::before { content:''; position:absolute; top:0; left:0; right:0; height:1px; background:linear-gradient(90deg,transparent,rgba(212,168,67,0.4),transparent); }
.lp-sc-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem; }
.lp-sc-label { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.1em; color:rgba(255,255,255,0.35); }
.lp-sc-badge { background:rgba(45,138,78,0.15); color:#5DD87A; font-size:11px; font-weight:700; padding:4px 12px; border-radius:999px; border:1px solid rgba(45,138,78,0.25); }
.lp-sc-arc { display:flex; justify-content:center; margin-bottom:1.25rem; position:relative; width:170px; height:95px; margin-left:auto; margin-right:auto; }
.lp-sc-arc svg { width:100%; height:100%; }
.lp-sc-arc-val { position:absolute; bottom:0; left:50%; transform:translateX(-50%); text-align:center; }
.lp-sc-arc-num { font-family:var(--rh-font-mono); font-size:40px; font-weight:700; color:var(--rh-gold); line-height:1; }
.lp-sc-arc-total { font-family:var(--rh-font-mono); font-size:15px; color:rgba(255,255,255,0.25); margin-left:2px; }
.lp-sc-factors { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
.lp-sc-factor { display:flex; align-items:center; gap:8px; padding:9px 10px; background:rgba(255,255,255,0.04); border-radius:8px; border:1px solid rgba(255,255,255,0.06); transition: background 0.2s ease; }
.lp-sc-factor:hover { background:rgba(255,255,255,0.07); }
.lp-sc-dot { width:7px; height:7px; border-radius:50%; flex-shrink:0; }
.lp-sc-dot.ok { background:#5DD87A; box-shadow: 0 0 6px rgba(93,216,122,0.4); }
.lp-sc-dot.warn { background:var(--rh-gold); box-shadow: 0 0 6px rgba(212,168,67,0.4); }
.lp-sc-factor-text { font-size:11px; color:rgba(255,255,255,0.55); line-height:1.3; }
.lp-sc-footer { margin-top:1rem; padding-top:0.85rem; border-top:1px solid rgba(255,255,255,0.06); display:flex; justify-content:space-between; align-items:center; }
.lp-sc-footer-text { font-size:11px; color:rgba(255,255,255,0.3); }
.lp-sc-footer-link { font-size:12px; font-weight:700; color:var(--rh-gold); text-decoration:none; display:flex; align-items:center; gap:4px; transition:all 0.2s ease; background:none; border:none; cursor:pointer; font-family:var(--rh-font); }
.lp-sc-footer-link:hover { color:var(--rh-gold-light); gap: 6px; }

/* ── Stats ── */
.lp-stats { background:var(--rh-surface); border-bottom:1px solid var(--rh-border); padding:1.25rem 2.5rem; }
.lp-stats-inner { max-width:1120px; margin:0 auto; display:grid; grid-template-columns:repeat(4,1fr); gap:2rem; }
.lp-stat { text-align:center; padding: var(--rh-space-2) 0; }
.lp-stat-num { font-family:var(--rh-font-mono); font-size:28px; font-weight:700; color:var(--rh-navy-deep); line-height:1; }
.lp-stat-label { font-size:12px; color:var(--rh-text-sec); margin-top:4px; font-weight:500; }

/* ── Sections shared ── */
.lp-section { padding:5rem 2.5rem; }
.lp-section-inner { max-width:1120px; margin:0 auto; }
.lp-section-eyebrow { font-size:11px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:var(--rh-gold-dark); margin-bottom:0.5rem; }
.lp-section-title { font-family:var(--rh-font-display); font-size:clamp(26px,3.2vw,38px); color:var(--rh-text); line-height:1.12; margin-bottom:0.75rem; }
.lp-section-sub { font-size:15px; color:var(--rh-text-sec); line-height:1.7; max-width:520px; }

/* ── Qué es (bento split) ── */
.lp-what { background: var(--rh-surface); border-top:1px solid var(--rh-border); }
.lp-what-split { display:grid; grid-template-columns:1fr 1fr; gap:3rem; align-items:center; margin-top:2.5rem; }
.lp-what-visual {
  background: var(--rh-navy-deep); border-radius:20px; padding:2.5rem;
  position:relative; overflow:hidden; min-height:320px;
  display:flex; align-items:center; justify-content:center;
  box-shadow: 0 8px 32px rgba(11,26,46,0.15);
}
.lp-what-visual::before {
  content:''; position:absolute; top:-60px; right:-60px;
  width:200px; height:200px; border-radius:50%;
  background:radial-gradient(circle,rgba(212,168,67,0.12) 0%,transparent 70%);
}
.lp-what-visual-inner { position:relative; z-index:1; text-align:center; }
.lp-what-big-num { font-family:var(--rh-font-mono); font-size:80px; font-weight:700; color:var(--rh-gold); line-height:1; }
.lp-what-big-label { font-size:14px; color:rgba(255,255,255,0.45); margin-top:0.5rem; }
.lp-what-points { list-style:none; display:flex; flex-direction:column; gap:1rem; }
.lp-what-point {
  display:flex; gap:1rem; align-items:flex-start;
  padding:1.1rem 1.25rem; background:var(--rh-bg);
  border:1px solid var(--rh-border); border-radius:12px;
  transition:all 0.25s ease;
}
.lp-what-point:hover { border-color:rgba(212,168,67,0.3); transform:translateX(4px); box-shadow: 0 4px 16px rgba(11,26,46,0.04); }
.lp-what-point-icon {
  width:40px; height:40px; border-radius:10px;
  background:rgba(212,168,67,0.08); display:flex; align-items:center; justify-content:center; flex-shrink:0;
  border: 1px solid rgba(212,168,67,0.12);
}
.lp-what-point-icon svg { width:18px; height:18px; color:var(--rh-gold-dark); }
.lp-what-point-title { font-size:14px; font-weight:700; color:var(--rh-text); margin-bottom:2px; }
.lp-what-point-desc { font-size:13px; color:var(--rh-text-sec); line-height:1.5; }

/* ── Process ── */
.lp-process { background:var(--rh-navy-deep); position:relative; }
.lp-process::before {
  content:''; position:absolute; inset:0; opacity:0.025;
  background-image:
    linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px);
  background-size:50px 50px;
}
.lp-process .lp-section-eyebrow { color:var(--rh-gold); }
.lp-process .lp-section-title { color:#fff; }
.lp-process .lp-section-sub { color:rgba(255,255,255,0.45); }
.lp-process-steps {
  display:grid; grid-template-columns:repeat(3,1fr); gap:0;
  margin-top:3rem; position:relative;
}
.lp-process-steps::before {
  content:''; position:absolute; top:40px; left:calc(16.67% + 20px); right:calc(16.67% + 20px);
  height:2px; background:linear-gradient(90deg,rgba(212,168,67,0.1),rgba(212,168,67,0.3),rgba(212,168,67,0.1));
}
.lp-process-step {
  text-align:center; padding:0 1.5rem; position:relative;
}
.lp-process-step-num {
  width:52px; height:52px; border-radius:50%;
  background:rgba(212,168,67,0.12); border:2px solid rgba(212,168,67,0.25);
  display:flex; align-items:center; justify-content:center;
  margin:0 auto 1.25rem; font-family:var(--rh-font-mono);
  font-size:17px; font-weight:700; color:var(--rh-gold);
  position:relative; z-index:1;
  transition: all 0.3s ease;
}
.lp-process-step:hover .lp-process-step-num {
  background:rgba(212,168,67,0.2);
  border-color: rgba(212,168,67,0.4);
  transform: scale(1.05);
}
.lp-process-step-title { font-family:var(--rh-font-display); font-size:20px; color:#fff; margin-bottom:0.5rem; }
.lp-process-step-desc { font-size:13px; color:rgba(255,255,255,0.45); line-height:1.65; max-width:260px; margin:0 auto; }
.lp-process-step-time {
  margin-top:0.85rem; font-size:11px; font-weight:600; color:var(--rh-gold);
  display:flex; align-items:center; justify-content:center; gap:5px;
}

/* ── Features (bento 2+2) ── */
.lp-features-grid { display:grid; grid-template-columns:1fr 1fr; gap:1.25rem; margin-top:2.5rem; }
.lp-feature-card {
  background:var(--rh-surface); border:1px solid var(--rh-border);
  border-radius:16px; padding:1.75rem;
  transition:transform 0.25s, box-shadow 0.25s, border-color 0.25s;
  position: relative; overflow: hidden;
}
.lp-feature-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 3px;
  background: linear-gradient(90deg, var(--rh-gold) 0%, transparent 100%);
  opacity: 0;
  transition: opacity 0.25s ease;
}
.lp-feature-card:hover { transform:translateY(-3px); box-shadow:0 10px 35px rgba(11,26,46,0.06); border-color:rgba(212,168,67,0.25); }
.lp-feature-card:hover::before { opacity: 1; }
.lp-feature-card.is-wide { grid-column:span 2; display:grid; grid-template-columns:1fr 1fr; gap:2rem; align-items:center; }
.lp-feature-icon {
  width:48px; height:48px; border-radius:12px;
  background:linear-gradient(135deg,var(--rh-gold),var(--rh-gold-dark));
  display:flex; align-items:center; justify-content:center; margin-bottom:1rem;
  box-shadow: 0 2px 8px rgba(212,168,67,0.2);
}
.lp-feature-icon svg { width:22px; height:22px; color:var(--rh-navy-deep); }
.lp-feature-title { font-size:16px; font-weight:700; color:var(--rh-text); margin-bottom:0.4rem; }
.lp-feature-desc { font-size:13px; color:var(--rh-text-sec); line-height:1.6; }
.lp-feature-visual {
  background:var(--rh-navy-deep); border-radius:12px; padding:1.5rem;
  display:flex; align-items:center; justify-content:center; min-height:140px;
  position:relative; overflow:hidden;
}
.lp-feature-visual::before {
  content:''; position:absolute; top:-30px; right:-30px;
  width:100px; height:100px; border-radius:50%;
  background:radial-gradient(circle,rgba(212,168,67,0.1) 0%,transparent 70%);
}
.lp-feature-visual-num { font-family:var(--rh-font-mono); font-size:48px; font-weight:700; color:var(--rh-gold); position:relative; z-index:1; }
.lp-feature-visual-label { font-size:12px; color:rgba(255,255,255,0.4); position:relative; z-index:1; margin-top:0.25rem; }

/* ── Vision/Mission ── */
.lp-vision { background:var(--rh-bg); }
.lp-vision-grid { display:grid; grid-template-columns:1fr 1fr; gap:1.5rem; margin-top:2.5rem; }
.lp-vision-card {
  padding:2.25rem; border-radius:16px; background:var(--rh-surface);
  border:1px solid var(--rh-border); position:relative; overflow:hidden;
  transition:border-color 0.2s, transform 0.2s;
}
.lp-vision-card:hover { border-color:rgba(212,168,67,0.25); transform:translateY(-2px); }
.lp-vision-card::before {
  content:''; position:absolute; top:-40px; right:-40px;
  width:120px; height:120px; border-radius:50%;
  background:radial-gradient(circle,rgba(212,168,67,0.06) 0%,transparent 70%);
}
.lp-vision-icon {
  width:52px; height:52px; border-radius:13px;
  background:linear-gradient(135deg,var(--rh-gold),var(--rh-gold-dark));
  display:flex; align-items:center; justify-content:center;
  margin-bottom:1.25rem; position:relative; z-index:1;
}
.lp-vision-icon svg { width:26px; height:26px; color:var(--rh-navy-deep); }
.lp-vision-card h3 {
  font-family:var(--rh-font-display); font-size:1.2rem; color:var(--rh-text);
  margin-bottom:0.6rem; position:relative; z-index:1;
}
.lp-vision-card p { font-size:14px; color:var(--rh-text-sec); line-height:1.7; position:relative; z-index:1; }

/* ── FAQ + Contact ── */
.lp-faq { background:var(--rh-surface); border-top:1px solid var(--rh-border); }
.lp-faq-grid { display:grid; grid-template-columns:1fr 1fr; gap:3rem; align-items:start; margin-top:2.5rem; }
.lp-faq-list { }
.lp-faq-item { border-bottom:1px solid var(--rh-border); }
.lp-faq-item:first-child { border-top:1px solid var(--rh-border); }
.lp-faq-q {
  width:100%; background:none; border:none; padding:1.1rem 0;
  cursor:pointer; text-align:left; display:flex; justify-content:space-between;
  align-items:center; gap:12px; font-family:var(--rh-font); font-size:14px;
  font-weight:600; color:var(--rh-text); transition:color 0.2s;
}
.lp-faq-q:hover { color:var(--rh-gold-dark); }
.lp-faq-chevron { width:16px; height:16px; flex-shrink:0; color:var(--rh-gold); transition:transform 0.3s; }
.lp-faq-chevron.open { transform:rotate(180deg); }
.lp-faq-a { font-size:13px; color:var(--rh-text-sec); line-height:1.7; padding:0 0 1.1rem; }

/* ── Contact Form (next to FAQ) ── */
.lp-contact-card {
  background:var(--rh-bg); border:1px solid var(--rh-border); border-radius:16px;
  padding:2rem; position:relative;
}
.lp-contact-title {
  font-family:var(--rh-font-display); font-size:20px; color:var(--rh-text);
  margin-bottom:0.5rem;
}
.lp-contact-desc { font-size:13px; color:var(--rh-text-sec); line-height:1.6; margin-bottom:1.5rem; }
.lp-contact-field { display:flex; flex-direction:column; gap:5px; margin-bottom:12px; }
.lp-contact-label { font-size:12px; font-weight:600; color:rgba(11,26,46,0.55); }
.lp-contact-input, .lp-contact-textarea {
  width:100%; padding:10px 14px; border:1.5px solid rgba(11,26,46,0.10);
  border-radius:10px; background:#fff; color:var(--rh-text); font-size:14px;
  font-family:var(--rh-font); transition:border-color 0.2s, box-shadow 0.2s; outline:none;
}
.lp-contact-input::placeholder, .lp-contact-textarea::placeholder { color:rgba(11,26,46,0.28); }
.lp-contact-input:focus, .lp-contact-textarea:focus {
  border-color:var(--rh-gold); box-shadow:0 0 0 3px rgba(212,168,67,0.12);
}
.lp-contact-textarea { min-height:100px; resize:vertical; line-height:1.5; }
.lp-contact-submit {
  width:100%; padding:12px; border:none; border-radius:10px;
  background:var(--rh-navy-deep); color:#fff; font-size:14px; font-weight:700;
  font-family:var(--rh-font); cursor:pointer;
  transition:background 0.2s, transform 0.15s; margin-top:4px;
}
.lp-contact-submit:hover { background:var(--rh-navy); transform:translateY(-1px); }
.lp-contact-submit:active { transform:translateY(0); }

/* ── Team ── */
.lp-team { background:var(--rh-bg); }
.lp-team-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:1.25rem; margin-top:2.5rem; }
.lp-team-card {
  padding:1.75rem; border-radius:14px; background:var(--rh-surface);
  border:1px solid var(--rh-border); text-align:center;
  transition:border-color 0.25s, transform 0.25s, box-shadow 0.25s;
}
.lp-team-card:hover { border-color:rgba(212,168,67,0.25); transform:translateY(-3px); box-shadow:0 10px 35px rgba(11,26,46,0.06); }
.lp-team-avatar {
  width:72px; height:72px; border-radius:50%; margin:0 auto 1rem;
  background:linear-gradient(135deg,var(--rh-navy),var(--rh-navy-mid));
  display:flex; align-items:center; justify-content:center;
  border:2px solid var(--rh-border); font-family:var(--rh-font-display);
  font-size:22px; font-weight:700; color:rgba(255,255,255,0.7);
}
.lp-team-name { font-family:var(--rh-font-display); font-size:1rem; color:var(--rh-text); margin-bottom:3px; }
.lp-team-role { font-size:12px; font-weight:600; color:var(--rh-gold-dark); margin-bottom:6px; }
.lp-team-desc { font-size:12px; color:var(--rh-text-sec); line-height:1.5; }

/* ── CTA ── */
.lp-cta {
  background:linear-gradient(165deg,var(--rh-navy-deep),var(--rh-navy));
  padding:4.5rem 2.5rem; text-align:center; position:relative; overflow:hidden;
}
.lp-cta::before {
  content:''; position:absolute; bottom:-100px; right:-100px;
  width:300px; height:300px; border-radius:50%;
  background:radial-gradient(circle,rgba(212,168,67,0.08) 0%,transparent 70%);
}
.lp-cta::after {
  content:''; position:absolute; inset:0; opacity:0.02;
  background-image:
    linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px);
  background-size:50px 50px;
}
.lp-cta-inner { max-width:520px; margin:0 auto; position:relative; z-index:1; }
.lp-cta h2 { font-family:var(--rh-font-display); font-size:clamp(28px,3.5vw,40px); color:#fff; margin-bottom:0.85rem; line-height:1.1; }
.lp-cta h2 .gold { color:var(--rh-gold); }
.lp-cta p { font-size:15px; color:rgba(255,255,255,0.5); margin-bottom:2rem; line-height:1.7; }
.lp-cta-btn {
  background:linear-gradient(135deg, var(--rh-gold) 0%, var(--rh-gold-dark) 100%);
  color:var(--rh-navy-deep);
  padding:14px 28px; border-radius:10px; font-size:15px; font-weight:700;
  border:none; cursor:pointer; font-family:var(--rh-font);
  display:inline-flex; align-items:center; gap:8px;
  box-shadow:0 4px 20px rgba(212,168,67,0.3);
  transition:all 0.25s ease;
}
.lp-cta-btn:hover { transform:translateY(-2px); box-shadow:0 8px 32px rgba(212,168,67,0.4); }
.lp-cta-btn:active { transform:translateY(0); }

/* ── Footer ── */
.lp-footer { background:var(--rh-navy-deep); border-top:1px solid rgba(212,168,67,0.08); }
.lp-footer-top {
  display:grid; grid-template-columns:1.2fr 1fr 1fr 1fr; gap:2.5rem;
  padding:3rem 2.5rem 2.5rem; max-width:1120px; margin:0 auto;
}
.lp-footer-col-title {
  font-size:0.6875rem; font-weight:700; text-transform:uppercase; letter-spacing:0.1em;
  color:rgba(255,255,255,0.3); margin-bottom:1rem;
}
.lp-footer-brand-col { display:flex; flex-direction:column; gap:0.75rem; }
.lp-footer-brand-logo { height:36px; width:auto; align-self:flex-start; filter: brightness(0) invert(1); opacity: 0.9; }
.lp-footer-brand-slogan { font-size:0.8125rem; color:rgba(255,255,255,0.4); line-height:1.6; max-width:220px; }
.lp-footer-links-col { display:flex; flex-direction:column; gap:0.6rem; }
.lp-footer-link {
  font-size:0.8125rem; color:rgba(255,255,255,0.5); text-decoration:none;
  font-weight:500; transition:all 0.2s ease; background:none; border:none;
  cursor:pointer; font-family:var(--rh-font); text-align:left; padding:2px 0;
}
.lp-footer-link:hover { color:var(--rh-gold); }
.lp-footer-social-col { display:flex; flex-direction:column; gap:0.6rem; }
.lp-footer-social-link {
  display:inline-flex; align-items:center; gap:8px;
  font-size:0.8125rem; color:rgba(255,255,255,0.5); text-decoration:none;
  font-weight:500; transition:all 0.2s ease; background:none; border:none;
  cursor:pointer; font-family:var(--rh-font); padding:2px 0;
}
.lp-footer-social-link:hover { color:var(--rh-gold); }
.lp-footer-social-link svg { width:18px; height:18px; flex-shrink:0; }
.lp-footer-partners-col { display:flex; flex-direction:column; gap:0.75rem; }
.lp-footer-partner-placeholder {
  padding:0.75rem 1rem; border:1px dashed rgba(255,255,255,0.12);
  border-radius:var(--rh-radius-md); font-size:0.6875rem; color:rgba(255,255,255,0.2);
  text-align:center; min-height:48px; display:flex; align-items:center; justify-content:center;
}
.lp-footer-bottom {
  border-top:1px solid rgba(255,255,255,0.06);
  padding:1.25rem 2.5rem; max-width:1120px; margin:0 auto;
  display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;
}
.lp-footer-copy { font-size:0.6875rem; color:rgba(255,255,255,0.25); }
.lp-footer-legal { display:flex; gap:1.25rem; }
.lp-footer-legal-link {
  font-size:0.6875rem; color:rgba(255,255,255,0.25); text-decoration:none;
  transition:color 0.2s; background:none; border:none; cursor:pointer;
  font-family:var(--rh-font);
}
.lp-footer-legal-link:hover { color:rgba(255,255,255,0.5); }

/* ── Responsive ── */
@media (max-width:900px) {
  .lp-hero-inner { grid-template-columns:1fr; gap:2.5rem; }
  .lp-hero { padding:3.5rem 1.5rem 3rem; min-height:auto; }
  .lp-what-split { grid-template-columns:1fr; }
  .lp-features-grid { grid-template-columns:1fr; }
  .lp-feature-card.is-wide { grid-template-columns:1fr; }
  .lp-process-steps { grid-template-columns:1fr; gap:2rem; }
  .lp-process-steps::before { display:none; }
  .lp-vision-grid { grid-template-columns:1fr; }
  .lp-faq-grid { grid-template-columns:1fr; }
  .lp-team-grid { grid-template-columns:1fr 1fr; }
  .lp-stats-inner { grid-template-columns:repeat(2,1fr); }
  .lp-nav-right { display:none; }
  .lp-footer-top { grid-template-columns:1fr 1fr; }
  .lp-footer-bottom { flex-direction:column; text-align:center; }
}
@media (max-width:560px) {
  .lp-nav { padding:0 1.25rem; }
  .lp-section { padding:3rem 1.25rem; }
  .lp-hero h1 { font-size:30px; }
  .lp-stats-inner { grid-template-columns:1fr 1fr; gap:1rem; }
  .lp-stat-num { font-size:20px; }
  .lp-sc-factors { grid-template-columns:1fr; }
  .lp-team-grid { grid-template-columns:1fr; }
  .lp-footer-top { grid-template-columns:1fr; }
}
@media (prefers-reduced-motion:reduce) {
  *,*::before,*::after { animation:none!important; transition:none!important; }
  .lp { scroll-behavior:auto; }
}
`;

function FaqItem({ question, answer }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="lp-faq-item">
      <button className="lp-faq-q" type="button" onClick={() => setOpen(!open)}>
        {question}
        <svg className={`lp-faq-chevron ${open ? "open" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && <div className="lp-faq-a">{answer}</div>}
    </div>
  );
}

const faqs = [
  { q: "¿Es gratis?", a: "Sí. RutaHogar es una herramienta orientativa completamente gratuita. No se requiere pago ni tarjeta de crédito." },
  { q: "¿Necesito crear cuenta?", a: "No. Puedes obtener tu resultado sin registrarte. Si quieres guardar tu progreso, puedes crear una cuenta." },
  { q: "¿Reemplaza una evaluación bancaria?", a: "No. RutaHogar es orientativo. Te da una idea de tu posición financiera, pero no constituye una precalificación formal." },
  { q: "¿Mis datos están seguros?", a: "Sí. No consultamos bases de datos bancarias. Los datos que ingresas se procesan localmente y no se comparten." },
  { q: "¿Qué es el score?", a: "Es un número de 0 a 100 que refleja qué tan preparado estás para un crédito hipotecario, basado en ingresos, ahorro, deuda y contexto." },
];

const NAV_ITEMS = [
  { id: "inicio", label: "Inicio" },
  { id: "que-es", label: "Qué es RutaHogar" },
  { id: "quienes-somos", label: "Quiénes somos" },
  { id: "contacto", label: "Contacto" },
];

export default function LandingPage({
  profile,
  onStart,
  onLogin,
  onRegister,
  onDashboard,
  onLogout,
}) {
  const isLoggedIn = Boolean(profile);
  const primaryActionLabel = !isLoggedIn
    ? "Evalúa tu perfil gratis"
    : profile.role === "usuario"
      ? "Continuar con mi perfil"
      : "Ir al dashboard";

  const [activeSection, setActiveSection] = useState("inicio");
  const [contactForm, setContactForm] = useState({ name: "", email: "", message: "" });

  const handleNavClick = useCallback((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  useEffect(() => {
    const sectionIds = NAV_ITEMS.map((item) => item.id);
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0 }
    );

    sectionIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <>
      <style>{landingStyles}</style>
      <div className="lp">

        {/* Nav */}
        <nav className="lp-nav">
          <a className="lp-nav-brand" href="#inicio" onClick={(e) => { e.preventDefault(); handleNavClick("inicio"); }}>
            <img className="lp-nav-brand-logo" src="/brand/rutahogar/logo-rutahogar.svg" alt="RutaHogar" />
          </a>
          <div className="lp-nav-right">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                className={`lp-nav-tab ${activeSection === item.id ? "is-active" : ""}`}
                type="button"
                onClick={() => handleNavClick(item.id)}
              >
                {item.label}
              </button>
            ))}
            <button className="lp-nav-cta" type="button" onClick={onStart}>
              Evalúa tu perfil
            </button>
          </div>
        </nav>

        {/* Hero */}
        <section className="lp-hero" id="inicio">
          <div className="lp-hero-grid-pattern"></div>
          <div className="lp-hero-inner">
            <div className="lp-hero-copy">
              <div className="lp-hero-eyebrow">
                <span className="lp-hero-dot"></span>
                Precalificación inmobiliaria
              </div>
              <h1>Tu score para <span className="gold">tu primera vivienda</span></h1>
              <p className="lp-hero-sub">
                Responde unas preguntas y obtén tu score financiero en segundos.
                Sin documentos, sin claves bancarias.
              </p>
              <div className="lp-hero-actions">
                <button className="lp-hero-btn-primary" type="button" onClick={onStart}>
                  {primaryActionLabel}
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <path d="M4 10h12M11 5l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <button className="lp-hero-btn-outline" type="button" onClick={isLoggedIn ? onDashboard : onLogin}>
                  {isLoggedIn ? "Ir al dashboard" : "Ya tengo cuenta"}
                </button>
              </div>
            </div>

            {/* Score Card */}
            <div className="lp-score-card">
              <div className="lp-sc-header">
                <span className="lp-sc-label">Tu score orientativo</span>
                <span className="lp-sc-badge">Alto</span>
              </div>
              <div className="lp-sc-arc">
                <svg viewBox="0 0 200 110">
                  <defs>
                    <linearGradient id="arc-g" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" style={{stopColor:'#B8912E'}} />
                      <stop offset="50%" style={{stopColor:'#D4A843'}} />
                      <stop offset="100%" style={{stopColor:'#F0D68A'}} />
                    </linearGradient>
                  </defs>
                  <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" strokeLinecap="round" />
                  {/* Mismo trazado que la pista: pathLength lo normaliza a 100, así el
                      dash marca el score sin depender de un punto final calculado a mano. */}
                  <path d="M 20 100 A 80 80 0 0 1 180 100" pathLength="100" strokeDasharray="74 100" fill="none" stroke="url(#arc-g)" strokeWidth="10" strokeLinecap="round" />
                </svg>
                <div className="lp-sc-arc-val">
                  <span className="lp-sc-arc-num">74</span>
                  <span className="lp-sc-arc-total">/100</span>
                </div>
              </div>
              <div className="lp-sc-factors">
                <div className="lp-sc-factor"><span className="lp-sc-dot ok"></span><span className="lp-sc-factor-text">Ingresos estables</span></div>
                <div className="lp-sc-factor"><span className="lp-sc-dot ok"></span><span className="lp-sc-factor-text">Ahorro para el pie</span></div>
                <div className="lp-sc-factor"><span className="lp-sc-dot warn"></span><span className="lp-sc-factor-text">Continuidad laboral</span></div>
              </div>
              <div className="lp-sc-footer">
                <span className="lp-sc-footer-text">Ejemplo orientativo</span>
                <button className="lp-sc-footer-link" type="button" onClick={onStart}>
                  Calcular el mío
                  <svg width="12" height="12" viewBox="0 0 20 20" fill="none"><path d="M4 10h12M11 5l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Stats */}
        <div className="lp-stats">
          <div className="lp-stats-inner">
            <div className="lp-stat"><div className="lp-stat-num">~30s</div><div className="lp-stat-label">Tiempo de evaluación</div></div>
            <div className="lp-stat"><div className="lp-stat-num">0</div><div className="lp-stat-label">Documentos requeridos</div></div>
            <div className="lp-stat"><div className="lp-stat-num">0–100</div><div className="lp-stat-label">Rango de score</div></div>
            <div className="lp-stat"><div className="lp-stat-num">$0</div><div className="lp-stat-label">Costo, siempre</div></div>
          </div>
        </div>

        {/* Qué es RutaHogar */}
        <section className="lp-section lp-what" id="que-es">
          <div className="lp-section-inner">
            <div className="lp-section-eyebrow">Qué es RutaHogar</div>
            <h2 className="lp-section-title">Una radiografía financiera de tu primera vivienda</h2>
            <p className="lp-section-sub">RutaHogar no es un banco. Es una herramienta que te da claridad antes de dar el paso.</p>
            <div className="lp-what-split">
              <div className="lp-what-visual">
                <div className="lp-what-visual-inner">
                  <div className="lp-what-big-num">74</div>
                  <div className="lp-what-big-label">Score orientativo de ejemplo</div>
                </div>
              </div>
              <ul className="lp-what-points">
                <li className="lp-what-point">
                  <div className="lp-what-point-icon">
                    <svg viewBox="0 0 20 20" fill="none"><path d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16z" stroke="currentColor" strokeWidth="1.5"/><path d="M10 6v4l2.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  </div>
                  <div>
                    <div className="lp-what-point-title">Resultado en segundos</div>
                    <div className="lp-what-point-desc">Sin esperas, sin turnos, sin papeleo.</div>
                  </div>
                </li>
                <li className="lp-what-point">
                  <div className="lp-what-point-icon">
                    <svg viewBox="0 0 20 20" fill="none"><path d="M10 2l6 2v5c0 4-3 6-6 7-3-1-6-3-6-7V4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>
                  </div>
                  <div>
                    <div className="lp-what-point-title">Orientativo, no vinculante</div>
                    <div className="lp-what-point-desc">Una guía para entender tu posición, no una promesa.</div>
                  </div>
                </li>
                <li className="lp-what-point">
                  <div className="lp-what-point-icon">
                    <svg viewBox="0 0 20 20" fill="none"><rect x="3" y="3" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M7 10l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                  <div>
                    <div className="lp-what-point-title">Sin documentos</div>
                    <div className="lp-what-point-desc">Solo datos que ya conoces. Sin liquidaciones ni claves bancarias.</div>
                  </div>
                </li>
                <li className="lp-what-point">
                  <div className="lp-what-point-icon">
                    <svg viewBox="0 0 20 20" fill="none"><path d="M3 10l7-6 7 6M5 8.5V16a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                  <div>
                    <div className="lp-what-point-title">Hecho para Chile</div>
                    <div className="lp-what-point-desc">Diseñado para el mercado inmobiliario chileno y sus realidades.</div>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* Cómo funciona */}
        <section className="lp-section lp-process">
          <div className="lp-section-inner">
            <h2 className="lp-section-title">Tres pasos, resultado inmediato</h2>
            <p className="lp-section-sub">Sin trámites ni esperas. Completa el flujo en pocos minutos.</p>
            <div className="lp-process-steps">
              <div className="lp-process-step">
                <div className="lp-process-step-num">1</div>
                <div className="lp-process-step-title">Cuéntanos tu objetivo</div>
                <div className="lp-process-step-desc">Qué tipo de propiedad buscas, en qué comuna y en qué plazo planeas comprar.</div>
              </div>
              <div className="lp-process-step">
                <div className="lp-process-step-num">2</div>
                <div className="lp-process-step-title">Ingresa tus datos</div>
                <div className="lp-process-step-desc">Ingresos, deudas, ahorro y situación laboral. Datos aproximados, sin documentos.</div>
              </div>
              <div className="lp-process-step">
                <div className="lp-process-step-num">3</div>
                <div className="lp-process-step-title">Recibe tu score</div>
                <div className="lp-process-step-desc">Score de 0 a 100, clasificación y recomendaciones personalizadas.</div>
                <div className="lp-process-step-time">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 16 14"/></svg>
                  ~30 segundos
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Ventajas */}
        <section className="lp-section">
          <div className="lp-section-inner">
            <h2 className="lp-section-title">¿Por qué usar RutaHogar?</h2>
            <p className="lp-section-sub">Una forma simple y transparente de conocer tu posición financiera.</p>
            <div className="lp-features-grid">
              <div className="lp-feature-card">
                <div className="lp-feature-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 16 14"/></svg>
                </div>
                <div className="lp-feature-title">Sin esperas</div>
                <div className="lp-feature-desc">Tu score cuando lo necesitas, sin turnos ni demoras.</div>
              </div>
              <div className="lp-feature-card">
                <div className="lp-feature-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                </div>
                <div className="lp-feature-title">Privacidad total</div>
                <div className="lp-feature-desc">No consultamos bases de datos. Tus datos quedan contigo.</div>
              </div>
              <div className="lp-feature-card is-wide">
                <div>
                  <div className="lp-feature-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  </div>
                  <div className="lp-feature-title">Recomendaciones personalizadas</div>
                  <div className="lp-feature-desc">No solo un número. Obtén acciones concretas para mejorar tu posición financiera y acercarte a tu primera vivienda.</div>
                </div>
                <div className="lp-feature-visual">
                  <div>
                    <div className="lp-feature-visual-num">+12</div>
                    <div className="lp-feature-visual-label">Puntos potenciales de mejora</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Quiénes somos */}
        <section className="lp-section lp-vision" id="quienes-somos">
          <div className="lp-section-inner">
            <h2 className="lp-section-title">Quiénes somos</h2>
            <p className="lp-section-sub">Creemos que comprar tu primera vivienda no debería ser un misterio.</p>
            <div className="lp-vision-grid">
              <div className="lp-vision-card">
                <div className="lp-vision-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                </div>
                <h3>Visión</h3>
                <p>Ser la plataforma de orientación financiera e inmobiliaria más confiable de Chile, ayudando a cada comprador de primera vivienda a tomar decisiones informadas con claridad y confianza.</p>
              </div>
              <div className="lp-vision-card">
                <div className="lp-vision-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                </div>
                <h3>Misión</h3>
                <p>Democratizar el acceso a la información financiera inmobiliaria, ofreciendo una herramienta gratuita, simple y transparente que ayuda a los chilenos a entender su posición real antes de solicitar un crédito hipotecario.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Preguntas frecuentes + Contacto */}
        <section className="lp-section lp-faq" id="contacto">
          <div className="lp-section-inner">
            <div className="lp-section-eyebrow">Preguntas frecuentes</div>
            <h2 className="lp-section-title">¿Tienes dudas?</h2>
            <div className="lp-faq-grid">
              <div className="lp-faq-list">
                {faqs.map((faq) => (
                  <FaqItem key={faq.q} question={faq.q} answer={faq.a} />
                ))}
              </div>
              <div className="lp-contact-card">
                <div className="lp-contact-title">Escríbenos</div>
                <div className="lp-contact-desc">Resolvemos tus dudas personalizadamente. Completa el formulario y te contactaremos.</div>
                <div className="lp-contact-field">
                  <label className="lp-contact-label" htmlFor="lp-contact-name">Nombre</label>
                  <input
                    id="lp-contact-name"
                    className="lp-contact-input"
                    type="text"
                    placeholder="Tu nombre"
                    value={contactForm.name}
                    onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                  />
                </div>
                <div className="lp-contact-field">
                  <label className="lp-contact-label" htmlFor="lp-contact-email">Email</label>
                  <input
                    id="lp-contact-email"
                    className="lp-contact-input"
                    type="email"
                    placeholder="tu@correo.cl"
                    value={contactForm.email}
                    onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                  />
                </div>
                <div className="lp-contact-field">
                  <label className="lp-contact-label" htmlFor="lp-contact-msg">Mensaje</label>
                  <textarea
                    id="lp-contact-msg"
                    className="lp-contact-textarea"
                    placeholder="¿En qué podemos ayudarte?"
                    value={contactForm.message}
                    onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                  />
                </div>
                <button className="lp-contact-submit" type="button">
                  Enviar mensaje
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Equipo */}
        <section className="lp-section lp-team">
          <div className="lp-section-inner">
            <h2 className="lp-section-title">Nuestro Equipo</h2>
            <p className="lp-section-sub">Un equipo comprometido con ayudar a los chilenos a alcanzar su hogar.</p>
            <div className="lp-team-grid">
              {[
                { name: "Andrés Riquelme", role: "CEO & Fundador", initials: "AR" },
                { name: "Francisco Mardones", role: "CTO", initials: "FM" },
                { name: "Isaías Carte", role: "Director Comercial", initials: "IC" },
                { name: "María José Soto", role: "UX/UI Designer", initials: "MS" },
                { name: "Pedro Álvarez", role: "Desarrollador Full Stack", initials: "PA" },
                { name: "Camila Retamal", role: "Data & QA Lead", initials: "CR" },
              ].map((member) => (
                <div className="lp-team-card" key={member.name}>
                  <div className="lp-team-avatar">{member.initials}</div>
                  <div className="lp-team-name">{member.name}</div>
                  <div className="lp-team-role">{member.role}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="lp-cta">
          <div className="lp-cta-inner">
            <h2>¿Listo para conocer <span className="gold">tu score</span>?</h2>
            <p>
              {isLoggedIn
                ? "Tu sesión está activa y puedes continuar con tu precalificación."
                : "Es gratis, toma unos minutos y no necesitas crear una cuenta para empezar."}
            </p>
            <button className="lp-cta-btn" type="button" onClick={onStart}>
              {primaryActionLabel}
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M4 10h12M11 5l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </section>

        {/* Footer */}
        <footer className="lp-footer">
          <div className="lp-footer-top">
            {/* Col 1: Logo + slogan */}
            <div className="lp-footer-brand-col">
              <img className="lp-footer-brand-logo" src="/brand/rutahogar/logo-rutahogar.svg" alt="RutaHogar" />
              <p className="lp-footer-brand-slogan">Tu plataforma de orientación financiera e inmobiliaria para primera vivienda en Chile.</p>
            </div>

            {/* Col 2: Links */}
            <div>
              <div className="lp-footer-col-title">Navegación</div>
              <div className="lp-footer-links-col">
                <button className="lp-footer-link" type="button" onClick={() => handleNavClick("inicio")}>Inicio</button>
                <button className="lp-footer-link" type="button" onClick={() => handleNavClick("que-es")}>Qué hacemos</button>
                <button className="lp-footer-link" type="button" onClick={() => handleNavClick("quienes-somos")}>Quiénes somos</button>
                <button className="lp-footer-link" type="button" onClick={() => handleNavClick("contacto")}>Contacto</button>
              </div>
            </div>

            {/* Col 3: Social */}
            <div>
              <div className="lp-footer-col-title">Redes sociales</div>
              <div className="lp-footer-social-col">
                <button className="lp-footer-social-link" type="button">
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                  YouTube
                </button>
                <button className="lp-footer-social-link" type="button">
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>
                  Instagram
                </button>
                <button className="lp-footer-social-link" type="button">
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>
                  TikTok
                </button>
                <button className="lp-footer-social-link" type="button">
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                  LinkedIn
                </button>
              </div>
            </div>

            {/* Col 4: Partners */}
            <div>
              <div className="lp-footer-col-title">Somos parte de</div>
              <div className="lp-footer-partners-col">
                <div className="lp-footer-partner-placeholder">Logo UTFSM</div>
                <div className="lp-footer-partner-placeholder">Logo Feria de Software</div>
              </div>
            </div>
          </div>

          <div className="lp-footer-bottom">
            <span className="lp-footer-copy">© 2026 RutaHogar. Todos los derechos reservados.</span>
            <div className="lp-footer-legal">
              <button className="lp-footer-legal-link" type="button">Términos</button>
              <button className="lp-footer-legal-link" type="button">Privacidad</button>
            </div>
          </div>
        </footer>

      </div>
    </>
  );
}
