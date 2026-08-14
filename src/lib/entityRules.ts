export type EntityType =
  | "individual"
  | "company"
  | "trust"
  | "superannuation";

export const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
  individual: "Individual",
  company: "Company",
  trust: "Trust",
  superannuation: "Superannuation Fund",
};

export const ENTITY_TYPE_DESCRIPTIONS: Record<EntityType, string> = {
  individual:
    "50% CGT discount applies if asset held > 12 months. Net capital gain added to taxable income.",
  company:
    "No CGT discount. Net capital gain added to company taxable income at corporate tax rate.",
  trust:
    "50% CGT discount applies if asset held > 12 months. Net capital gain may be distributed to beneficiaries.",
  superannuation:
    "33% CGT discount applies if asset held > 12 months (effectively 1/3 taxable).",
};

export function getCgtDiscountRate(entityType: EntityType): number {
  switch (entityType) {
    case "individual":
      return 0.5;
    case "company":
      return 0;
    case "trust":
      return 0.5;
    case "superannuation":
      return 1 / 3;
    default:
      return 0.5;
  }
}

export function getTaxRate(entityType: EntityType): number {
  switch (entityType) {
    case "individual":
      return 0;
    case "company":
      return 0.25;
    case "trust":
      return 0;
    case "superannuation":
      return 0.15;
    default:
      return 0;
  }
}

export function getTaxRateLabel(entityType: EntityType): string {
  switch (entityType) {
    case "individual":
      return "Marginal rate";
    case "company":
      return "25%";
    case "trust":
      return "Beneficiary rate";
    case "superannuation":
      return "15%";
    default:
      return "—";
  }
}

export function calculateEstimatedTax(
  taxableGain: number,
  entityType: EntityType,
): number {
  if (taxableGain <= 0) return 0;
  const rate = getTaxRate(entityType);
  if (rate === 0) return 0;
  return taxableGain * rate;
}

export function getActiveAssetExemptionNote(entityType: EntityType): string | null {
  if (entityType === "company" || entityType === "trust") {
    return "Active asset exemption may apply for small businesses. Consult a tax agent to determine eligibility.";
  }
  return null;
}
