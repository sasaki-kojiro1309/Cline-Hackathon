import { z } from "zod/v4";
import data from "@/data/opportunities.json";
import { subjectActivities, starterActivities } from "@/data/subject-activities";
import { opportunitySchema } from "./schemas";

const catalogueSchema = z.array(opportunitySchema).min(80).max(300).refine(
  (items) => new Set(items.map((item) => item.id)).size === items.length,
  "Opportunity IDs must be unique.",
).refine((items) => items.every((item) => item.is_example && item.url === null), "The example catalogue must not contain external resources or live links.");
const catalogue = catalogueSchema.parse([...data, ...starterActivities, ...subjectActivities]);
export const getCatalogue = () => catalogue;
export const getOpportunityById = (id: string) => catalogue.find((item) => item.id === id);