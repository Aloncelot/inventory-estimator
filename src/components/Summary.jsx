// src/components/Summary.jsx
"use client";
import { useMemo, useState, useEffect } from "react";

const LS_KEY = "summary:project";

export default function Summary({ grandTotal = 0 }) {
  const [form, setForm] = useState({
    projectName: "",
    address: "",
    drawingsDate: "",
    estimateDate: "",
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setForm(JSON.parse(raw));
    } catch {}
  }, []);

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

  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(form)); } catch {}
  }, [form]);

  const moneyFmt = useMemo(
    () => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", currencyDisplay: "narrowSymbol" }),
    []
  );

  const onChange = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  return (
    <section className="card">
      <h2 className="card-title">Summary</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="fld">
          <span>Project name</span>
          <input name="projectName" value={form.projectName} onChange={onChange} />
        </label>
        <label className="fld">
          <span>Address</span>
          <input name="address" value={form.address} onChange={onChange} />
        </label>
        <label className="fld">
          <span>Drawings date</span>
          <input type="date" name="drawingsDate" value={form.drawingsDate} onChange={onChange} />
        </label>
        <label className="fld">
          <span>Estimate date</span>
          <input type="date" name="estimateDate" value={form.estimateDate} onChange={onChange} />
        </label>
      </div>

      <div className="sum-row">
        <div className="sum-label">Wall panels grand total</div>
        <div className="sum-value">{moneyFmt.format(Number(grandTotal||0))}</div>
      </div>
    </section>
  );
}
