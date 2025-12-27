"use client";

import { useState } from "react";
import "./styles.css"; // (optional if you want separate styling)

export default function ReportPage() {
  const [form, setForm] = useState({
    title: "",
    state: "",
    description: "",
    severity: "",
    coordinates: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();

  // minimal client-side validation (title + description required)
  if (!form.title?.trim() || !form.description?.trim()) {
    alert("Please provide a title and description.");
    return;
  }

  // send payload
  try {
    const base = (process.env.NEXT_PUBLIC_BACKEND_URL || "").replace(/\/$/, "");
    const url = base ? `${base}/api/reports` : `/api/reports`;

    // Keep coordinates raw (frontend will attempt the common "lat, lon" format)
    const payload = {
      title: form.title,
      state: form.state || null,
      description: form.description,
      severity: form.severity || null,
      coordinates: form.coordinates || null,
    };

    const resp = await fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => null);
      throw new Error(err?.error || `HTTP ${resp.status}`);
    }

    const data = await resp.json();
    // success UX: clear form and show message
    setForm({
      title: "",
      state: "",
      description: "",
      severity: "",
      coordinates: "",
    });

    alert(`Report submitted (id: ${data.id}). Thank you.`);
    console.log("Report created:", data);
  } catch (err: any) {
    console.error("Report submit failed:", err);
    alert(`Failed to submit report: ${err?.message || err}`);
  }
};


  const states = [
    "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut",
    "Delaware", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa",
    "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan",
    "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire",
    "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio",
    "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota",
    "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia",
    "Wisconsin", "Wyoming"
]


  return (
    <div className="report-page">
      <h1 className="page-title">Fire Report Form</h1>

      <form className="report-form" onSubmit={handleSubmit}>
        
        <label>
          Report Title
          <input
            type="text"
            name="title"
            placeholder="e.g. Wildfire near Yosemite"
            value={form.title}
            onChange={handleChange}
            required
          />
        </label>

        <label>
          State
          <select name="state" value={form.state} onChange={handleChange} required>
            <option value="">Select a state</option>
            {states.map((st) => (
              <option key={st} value={st}>{st}</option>
            ))}
          </select>
        </label>

        <label>
          Severity Level
          <select name="severity" value={form.severity} onChange={handleChange} required>
            <option value="">Select severity</option>
            <option value="Low">Low</option>
            <option value="Moderate">Moderate</option>
            <option value="High">High</option>
            <option value="Extreme">Extreme</option>
          </select>
        </label>

        <label>
          Coordinates (optional)
          <input
            type="text"
            name="coordinates"
            placeholder="e.g. 37.8651, -119.5383"
            value={form.coordinates}
            onChange={handleChange}
          />
        </label>

        <label>
          Description
          <textarea
            name="description"
            placeholder="Describe the fire conditions..."
            rows={5}
            value={form.description}
            onChange={handleChange}
            required
          />
        </label>

        <button type="submit" className="submit-btn">Submit Report</button>
      </form>
    </div>
  );
}
