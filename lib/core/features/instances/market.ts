import type { SubFeature, Feature } from "../types";

export const marketIntervalScanSubFeature: SubFeature = {
  id: "market.intervalScan",
  featureId: "market",
  label: "Interval scanner",
  isEnabled() {
    return true;
  },
};

export const marketAutoBuySubFeature: SubFeature = {
  id: "market.autoBuy",
  featureId: "market",
  label: "Auto-buy profitable flips",
  isEnabled(session) {
    return session.settings.marketAutoBuyEnabled;
  },
};

export const marketFeature: Feature = {
  id: "market",
  label: "Market",
  description: "Scans market prices and can auto-buy profitable flips.",
  dependsOn: [],
  subFeatures: [marketIntervalScanSubFeature, marketAutoBuySubFeature],
};
