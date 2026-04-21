import { assessLegionellaRisk, formatLegionellaValue } from "../services/legionellaAssessment.js";
import { generateLegionellaPdf } from "../services/legionellaPdfGenerator.js";

const VACANCY_OPTIONS = [
  { value: "less_than_1_week", label: "Less than 1 week" },
  { value: "one_to_four_weeks", label: "1 to 4 weeks" },
  { value: "more_than_four_weeks", label: "More than 4 weeks" },
];

const WATER_SYSTEM_OPTIONS = [
  { value: "unvented_cylinder", label: "Unvented Cylinder" },
  { value: "combi_boiler", label: "Combi Boiler" },
  { value: "vented_cylinder", label: "Vented Cylinder" },
  { value: "communal_supply", label: "Communal Supply" },
  { value: "cold_water_tank", label: "Cold Water Tank" },
  { value: "other", label: "Other" },
];

const YES_NO_OPTIONS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

const CONDITION_OPTIONS = [
  { value: "clean", label: "Clean" },
  { value: "fair", label: "Fair" },
  { value: "poor", label: "Poor" },
];

function RiskBadge({ value }) {
  const tone =
    value === "LOW RISK"
      ? "bg-emerald-100 text-emerald-800"
      : value === "MEDIUM RISK"
        ? "bg-amber-100 text-amber-800"
        : value === "HIGH RISK"
          ? "bg-red-100 text-red-800"
          : "bg-zinc-100 text-zinc-600";

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${tone}`}>
      {value || "Not Assessed"}
    </span>
  );
}

function ToggleGroup({ value, options, onChange }) {
  return (
    <div className={`grid gap-2 ${options.length === 2 ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-3"}`}>
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`rounded-full px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] ${
              active ? "bg-zinc-800 text-white" : "bg-zinc-100 text-zinc-600"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export default function LegionellaAssessment({
  assessment,
  propertyName,
  propertyAddress,
  branding,
  onChange,
  onSyncPropertyAddress,
}) {
  const value = assessment || {};

  const update = (patch) => {
    onChange?.({
      ...value,
      ...patch,
    });
  };

  const handleAssessRisk = () => {
    update({
      ...assessLegionellaRisk(value),
      assessedAt: new Date().toISOString(),
    });
  };

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600">
            Legionella Risk Assessment
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            Keep this as a dedicated assessment inside the inventory flow so it is easier to complete and export separately.
          </p>
        </div>
        <RiskBadge value={value.riskResult} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600">Property Address</p>
          <textarea
            value={propertyAddress || ""}
            onChange={(event) => onSyncPropertyAddress?.(event.target.value)}
            placeholder="Full property address"
            className="mt-3 min-h-[88px] w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="rounded-xl border border-zinc-200 p-3">
          <div className="grid grid-cols-1 gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600">Assessor Name</p>
              <input
                type="text"
                value={value.assessorName || ""}
                onChange={(event) => update({ assessorName: event.target.value })}
                placeholder="Assessor name"
                className="mt-3 h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm"
              />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600">Assessment Date</p>
              <input
                type="date"
                value={value.assessmentDate || ""}
                onChange={(event) => update({ assessmentDate: event.target.value })}
                className="mt-3 h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 p-3">
          <p className="text-xs text-zinc-600">Vacancy Duration</p>
          <div className="mt-2">
            <ToggleGroup
              value={value.vacancyDuration}
              options={VACANCY_OPTIONS}
              onChange={(nextValue) => update({ vacancyDuration: nextValue })}
            />
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 p-3">
          <p className="text-xs text-zinc-600">Water System Type</p>
          <select
            value={value.waterSystemType || ""}
            onChange={(event) => update({ waterSystemType: event.target.value })}
            className="mt-2 h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm"
          >
            {WATER_SYSTEM_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-xl border border-zinc-200 p-3">
          <p className="text-xs text-zinc-600">Little-used outlets?</p>
          <div className="mt-2">
            <ToggleGroup
              value={value.littleUsedOutlets}
              options={[{ value: "no", label: "No" }, { value: "yes", label: "Yes" }]}
              onChange={(nextValue) => update({ littleUsedOutlets: nextValue })}
            />
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 p-3">
          <p className="text-xs text-zinc-600">System Condition</p>
          <div className="mt-2">
            <ToggleGroup
              value={value.systemCondition}
              options={CONDITION_OPTIONS}
              onChange={(nextValue) => update({ systemCondition: nextValue })}
            />
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 p-3 lg:col-span-2">
          <p className="text-xs text-zinc-600">Water temperature adequate?</p>
          <div className="mt-2 max-w-[280px]">
            <ToggleGroup
              value={value.waterTemperatureAdequate}
              options={YES_NO_OPTIONS}
              onChange={(nextValue) => update({ waterTemperatureAdequate: nextValue })}
            />
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600">Assessment Result</p>
            <p className="mt-2 text-2xl font-bold text-zinc-900">{value.riskResult || "Not Assessed"}</p>
            <p className="mt-2 max-w-2xl text-sm text-zinc-600">
              {value.riskSummary || "Run the assessment to generate a risk level and recommended action."}
            </p>
            <p className="mt-2 text-[11px] text-zinc-500">
              Current inputs: {formatLegionellaValue(value.vacancyDuration)}, {formatLegionellaValue(value.waterSystemType)},{" "}
              {formatLegionellaValue(value.littleUsedOutlets)} outlets, {formatLegionellaValue(value.systemCondition)} system,{" "}
              temperature {formatLegionellaValue(value.waterTemperatureAdequate)}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleAssessRisk}
              className="h-11 rounded-lg bg-zinc-800 px-4 text-sm font-semibold text-white"
            >
              Assess Risk
            </button>
            <button
              type="button"
              onClick={() =>
                generateLegionellaPdf({
                  assessment: value,
                  propertyName,
                  propertyAddress,
                  branding,
                })
              }
              className="h-11 rounded-lg bg-zinc-200 px-4 text-sm font-semibold text-zinc-800"
            >
              Download PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
