const PRESETS = [
  { label: "15 min", minutes: 15 },
  { label: "30 min", minutes: 30 },
  { label: "1 hour", minutes: 60 },
  { label: "2 hours", minutes: 120 },
  { label: "3 hours", minutes: 180 },
];

interface DurationPickerProps {
  selectedMinutes: number | "custom";
  onSelect: (minutes: number | "custom") => void;
  customMinutes: number;
  onCustomMinutesChange: (minutes: number) => void;
}

export default function DurationPicker({ selectedMinutes, onSelect, customMinutes, onCustomMinutesChange }: DurationPickerProps) {
  return (
    <div>
      <div className="chip-row">
        {PRESETS.map((p) => (
          <button
            key={p.minutes}
            className={`chip${selectedMinutes === p.minutes ? " selected" : ""}`}
            onClick={() => onSelect(p.minutes)}
          >
            {p.label}
          </button>
        ))}
        <button
          className={`chip${selectedMinutes === "custom" ? " selected" : ""}`}
          onClick={() => onSelect("custom")}
        >
          Custom
        </button>
      </div>

      {selectedMinutes === "custom" && (
        <div className="mt-16">
          <label className="field-label">Duration (minutes)</label>
          <input
            type="number"
            className="input"
            min={1}
            max={10080}
            value={customMinutes}
            onChange={(e) => onCustomMinutesChange(Math.max(1, Number(e.target.value) || 1))}
          />
        </div>
      )}
    </div>
  );
}
