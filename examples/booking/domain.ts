export type CustomerClearance = { designatedPort: string };
export type RouteStop = { visitedPort: string };

export type BookingTerms = {
  origin: string;
  destination: string;
  clearance: CustomerClearance;
};

export type NetworkConditions = {
  origin: string;
  destination: string;
  requiredVia: string;
};

export type NetworkFinding =
  | { result: "route-found"; itinerary: readonly RouteStop[] }
  | { result: "no-route" };

export type CapacityFinding = "within-limit" | "over-limit";
export type BookingDecision = "confirmed" | "rejected";

const terms = {
  origin: "Busan",
  destination: "Osaka",
  clearance: { designatedPort: "Kobe" },
} as const satisfies BookingTerms;

export const networkConditions = {
  origin: terms.origin,
  destination: terms.destination,
  requiredVia: terms.clearance.designatedPort,
} satisfies NetworkConditions & { requiredVia: typeof terms.clearance.designatedPort };

export const networkFinding = {
  result: "route-found",
  itinerary: [{ visitedPort: "Busan" }, { visitedPort: "Kobe" }, { visitedPort: "Osaka" }],
} satisfies NetworkFinding;

type MustBeFalse<Claim extends false> = Claim;

export type AStopCannotStandForCustomerClearance = MustBeFalse<
  RouteStop extends CustomerClearance ? true : false
>;
export type AFoundRouteCannotStandForBookingConfirmation = MustBeFalse<
  typeof networkFinding.result extends BookingDecision ? true : false
>;
