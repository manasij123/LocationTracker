import type { ReactNode } from "react";
import { useTheme } from "../hooks/useTheme";

export default function Settings() {
  const { theme, setTheme } = useTheme();

  return (
    <div>
      <h1 className="page-title">Settings</h1>
      <p className="page-subtitle">Manage your account and app preferences.</p>

      <div className="section flex-col gap-16">
        <SettingsSection title="Account">
          <div className="flex items-center gap-12">
            <div className="avatar" style={{ width: 46, height: 46, fontSize: 17 }}>D</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14.5 }}>Demo User</div>
              <div className="text-muted" style={{ fontSize: 13 }}>demo@spotshare.app</div>
            </div>
          </div>
        </SettingsSection>

        <SettingsSection title="Appearance">
          <div className="field-label">Theme</div>
          <div className="chip-row">
            {(["light", "dark", "system"] as const).map((t) => (
              <button key={t} className={`chip${theme === t ? " selected" : ""}`} onClick={() => setTheme(t)}>
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </SettingsSection>

        <SettingsSection title="Notifications">
          <ToggleRow label="Link opened alerts" defaultChecked />
          <ToggleRow label="Expiration reminders" defaultChecked />
          <ToggleRow label="Weekly summary email" />
        </SettingsSection>

        <SettingsSection title="Privacy">
          <p className="text-muted" style={{ fontSize: 13.5, lineHeight: 1.6 }}>
            SpotShare never accesses or shares your device's real GPS location. Shared locations are
            manually selected places you choose. Visitor analytics are privacy-conscious — we record
            only an approximate device category and a non-reversible visit identifier, never precise
            visitor location or personal data.
          </p>
        </SettingsSection>

        <SettingsSection title="About">
          <p className="text-muted" style={{ fontSize: 13.5 }}>SpotShare v1.0.0</p>
          <p className="text-faint mt-8" style={{ fontSize: 12.5 }}>Location sharing, Done simply.</p>
        </SettingsSection>
      </div>
    </div>
  );
}

function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="card card-pad">
      <h2 className="section-title mb-16">{title}</h2>
      {children}
    </div>
  );
}

function ToggleRow({ label, defaultChecked }: { label: string; defaultChecked?: boolean }) {
  return (
    <label className="flex justify-between items-center" style={{ padding: "8px 0", cursor: "pointer" }}>
      <span style={{ fontSize: 14 }}>{label}</span>
      <input type="checkbox" defaultChecked={defaultChecked} style={{ width: 18, height: 18 }} />
    </label>
  );
}
