// src/components/Summary.jsx
"use client";
import { useMemo, useState, useEffect, useCallback, useEffectEvent } from "react";
import { useProject } from "@/context/ProjectContext";

const LS_KEY = "summary:project";

export default function Summary({ grandTotal = 0 }) {
  const { projectData, updateProject } = useProject();
  const onDataChange = useEffectEvent(updateProject);

  const [form, setForm] = useState({
    projectName: "",
    address: "",
    drawingsDate: "",
    estimateDate: "",
  });

  // useEffect(() => {
  //   try {
  //     const raw = localStorage.getItem(LS_KEY);
  //     if (raw) setForm(JSON.parse(raw));
  //   } catch {}
  // }, []);

  // Provide today's date after mount if empty
  useEffect(() => {
    if (!form.estimateDate) {
      const today = new Date();
      const iso = new Date(Date.UTC(
        today.getFullYear(), today.getMonth(), today.getDate()
      )).toISOString().slice(0,10);
      setForm(f => ({ ...f, estimateDate: iso }));
    }
  }, [form.estimateDate]);

  // Sumary
  const summaryInfo = useMemo(() => {
    const defaults = { 
      projectName: projectData?.name || "", 
      address: "", 
      drawingsDate: "", 
      estimateDate: "" 
    };
    return { ...defaults, ...(projectData?.estimateData?.summaryInfo || {}) };
  }, [projectData]);

  useEffect(() => {
    if (!projectData) return;

    const info = projectData.estimateData?.summaryInfo || {};
    const rootName = projectData.name || "";
    
    const today = new Date();
    const isoDate = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())).toISOString().slice(0,10);

    const needsDate = !info.estimateDate;
    const needsName = !info.projectName && rootName;

    if (needsDate || needsName) {
      onDataChange(prevEstimate => {
        const currentSummary = prevEstimate.summaryInfo || {};
        return {
          ...prevEstimate,
          summaryInfo: {
            ...currentSummary,
            estimateDate: needsDate ? isoDate : currentSummary.estimateDate,
            projectName: needsName ? rootName : currentSummary.projectName,
          }
        };
      });
    }
  }, [projectData, onDataChange]);

    const moneyFmt = useMemo(
    () => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", currencyDisplay: "narrowSymbol" }),
    []
  );

  const onChange = useCallback((e) => {
    const { name, value } = e.target;
    updateProject(prevEstimate => ({
        ...prevEstimate,
        summaryInfo: {
            ...(prevEstimate.summaryInfo || {}),
            [name]: value,
        }
    }));
  }, [updateProject]);


  return (
    <div className="ew-card">
      <h2 className="text-section-title" style={{ marginBottom: '16px' }}>Summary</h2>
      <div className="controls2">
        <label>
          <span>Project name</span>
          <input className="ew-input " name="projectName"  style={{color:'#81eee5'}} value={summaryInfo.projectName} onChange={onChange} />
        </label>
        <label>
          <span>Address</span>
          <input className="ew-input" name="address" style={{color:'#81eee5'}} value={summaryInfo.address} onChange={onChange} />
        </label>
        <label>
          <span>Drawings date</span>
          <input className="ew-input" type="date" name="drawingsDate" style={{color:'#81eee5'}} value={summaryInfo.drawingsDate} onChange={onChange} />
        </label>
        <label>
          <span>Estimate date</span>
          <input className="ew-input" type="date" name="estimateDate" style={{color:'#81eee5'}} value={summaryInfo.estimateDate} onChange={onChange} />
        </label>
      </div> 
      <div className="sum-row">
        <div className="sum-label">Wall panels total</div>
        <div className="text-summary-subcategory">
          {moneyFmt.format(Number(grandTotal||0))}
        </div>
      </div>
    </div>
  );
}