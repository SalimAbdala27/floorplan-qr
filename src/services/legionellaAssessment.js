const VACANCY_RISK = {
  less_than_1_week: 0,
  one_to_four_weeks: 1,
  more_than_four_weeks: 2,
};

const WATER_SYSTEM_RISK = {
  combi_boiler: 0,
  unvented_cylinder: 0,
  vented_cylinder: 1,
  communal_supply: 1,
  cold_water_tank: 2,
  other: 1,
};

const OUTLET_RISK = {
  no: 0,
  yes: 2,
};

const SYSTEM_CONDITION_RISK = {
  clean: 0,
  fair: 1,
  poor: 2,
};

const TEMPERATURE_RISK = {
  yes: 0,
  no: 2,
};

export function assessLegionellaRisk(assessment = {}) {
  const score =
    (VACANCY_RISK[assessment.vacancyDuration] || 0) +
    (WATER_SYSTEM_RISK[assessment.waterSystemType] || 0) +
    (OUTLET_RISK[assessment.littleUsedOutlets] || 0) +
    (SYSTEM_CONDITION_RISK[assessment.systemCondition] || 0) +
    (TEMPERATURE_RISK[assessment.waterTemperatureAdequate] || 0);

  if (score <= 2) {
    return {
      riskResult: "LOW RISK",
      riskScore: score,
      riskSummary: "No significant action required. Maintain system and ensure regular use.",
    };
  }

  if (score <= 5) {
    return {
      riskResult: "MEDIUM RISK",
      riskScore: score,
      riskSummary: "Some controls are needed. Flush little-used outlets and review the water system condition.",
    };
  }

  return {
    riskResult: "HIGH RISK",
    riskScore: score,
    riskSummary: "Immediate action recommended. Review the system, water temperatures, and outlet usage before re-occupation.",
  };
}

export function formatLegionellaValue(value) {
  if (!value) return "Not stated";
  return String(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
