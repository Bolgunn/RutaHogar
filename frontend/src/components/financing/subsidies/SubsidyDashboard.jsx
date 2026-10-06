import React, { useEffect, useMemo, useState } from "react";
import SubsidyDetailPanel from "./SubsidyDetailPanel";
import SubsidyFilters from "./SubsidyFilters";
import SubsidyList from "./SubsidyList";
import { subsidyCompatibility } from "./subsidyCompatibility";
import { SUBSIDY_DASHBOARD_ITEMS } from "./subsidyDashboardData";
import SectionNumber from "../SectionNumber";

function ordered(items, sort) {
  const copy = [...items];
  if (sort === "benefit") return copy.sort((left, right) => right.benefit.localeCompare(left.benefit));
  if (sort === "savings") return copy.sort((left, right) => left.summary.savings.localeCompare(right.summary.savings));
  return copy.sort((left, right) => Number(right.probable) - Number(left.probable));
}

export default function SubsidyDashboard({ evaluation, benefitStates, selectedBenefit, selectedVariant, onSelectBenefit, onClearBenefit }) {
  const [selectedId, setSelectedId] = useState("ds1-tramo-1");
  const [detailOpen, setDetailOpen] = useState(true);
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("relevance");
  useEffect(() => {
    if (!selectedVariant) return;
    setSelectedId(selectedVariant);
    setDetailOpen(true);
  }, [selectedVariant]);
  const compatibilityById = useMemo(() => Object.fromEntries(SUBSIDY_DASHBOARD_ITEMS.map((item) => [
    item.id,
    subsidyCompatibility(item, evaluation, benefitStates),
  ])), [evaluation, benefitStates]);
  const subsidies = useMemo(() => ordered(SUBSIDY_DASHBOARD_ITEMS
    .filter((item) => filter !== "probable" || compatibilityById[item.id]?.compatible)
    .filter((item) => filter !== "savings" || item.summary.savings !== "Pie desde 10%"), sort), [filter, sort, compatibilityById]);
  const selected = selectedId ? SUBSIDY_DASHBOARD_ITEMS.find((item) => item.id === selectedId) || null : null;
  const selectDetail = (id) => { setSelectedId(id); setDetailOpen(true); };
  const apply = (subsidy) => { onSelectBenefit(subsidy.benefitIdentifier, subsidy.id); setSelectedId(subsidy.id); };
  const closeDetail = () => { setDetailOpen(false); setSelectedId(null); onClearBenefit(); };
  const detailSubsidy = selected || subsidies[0] || null;
  const detailCompatibility = detailSubsidy ? compatibilityById[detailSubsidy.id] : null;
  return <section className={`subsidy-dashboard ${detailOpen ? "" : "is-detail-closed"}`} aria-labelledby="subsidy-dashboard-title">
    <div className="subsidy-dashboard__main">
      <header className="subsidy-dashboard__header"><SectionNumber number="2" /><div><span className="eyebrow">Subsidios</span><h2 id="subsidy-dashboard-title">Subsidios disponibles</h2></div></header>
      <SubsidyFilters filter={filter} onFilterChange={setFilter} sort={sort} onSortChange={setSort} />
      <SubsidyList subsidies={subsidies} selectedId={selectedId} compatibilityById={compatibilityById} onSelect={selectDetail} />
    </div>
    {detailOpen ? <SubsidyDetailPanel subsidy={detailSubsidy} compatibility={detailCompatibility} isApplied={detailSubsidy?.id === selectedVariant && detailSubsidy?.benefitIdentifier === selectedBenefit} onApply={apply} onClose={closeDetail} /> : null}
  </section>;
}
