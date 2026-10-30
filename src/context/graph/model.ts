import type { Scope, Retirement } from "../model.ts";

export type Entity = {
  id: string;
  kind: string;
  name: string;
  aliases: string[];
  sources: string[];
};

export type Statement = {
  id: string;
  subject: string;
  predicate: string;
  object: { entity: string; value?: never } | { value: unknown; entity?: never };
  text: string;
  scope: Scope;
  sources: string[];
  origin: { kind: "stated" } | { kind: "inferred"; premises: string[] };
  status: "active" | "unresolved" | "retired" | "superseded";
  supersedes: string[];
  contradicts: string[];
  conditions: string[];
  validFrom?: string;
  validUntil?: string;
  retirement?: Retirement;
  supersededBy?: string[];
  reviewNeeded?: string[];
};

export type Graph = { entities: Entity[]; statements: Statement[] };

export type GraphChanges = Graph & { retire: (Retirement & { id: string })[] };
