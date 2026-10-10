import { z } from "zod/v4";
import data from "@/data/opportunities.json";
import { opportunitySchema } from "./schemas";

const catalogueSchema = z.array(opportunitySchema).min(20).max(30).refine(
  (items) => new Set(items.map((item) => item.id)).size === items.length,
  "Opportunity IDs must be unique.",
);
const catalogue = catalogueSchema.parse(data);
export const getCatalogue = () => catalogue;
export const getOpportunityById = (id: string) => catalogue.find((item) => item.id === id);