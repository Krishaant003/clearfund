import { defineField, defineType } from "sanity";

export default defineType({
  name: "grant",
  title: "Grant",
  type: "document",
  fields: [
    defineField({
      name: "funder",
      title: "Funder",
      type: "reference",
      to: [{ type: "organization" }],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "recipient",
      title: "Recipient",
      type: "reference",
      to: [{ type: "organization" }],
      validation: (Rule) => Rule.required(),
    }),
    defineField({ name: "amountUsd", title: "Amount (USD)", type: "number" }),
    defineField({
      name: "amountType",
      title: "Amount Type",
      type: "string",
      options: { list: ["paid", "approved_future"] },
      description: "Never sum both types together — see dataset docs.",
    }),
    defineField({ name: "taxYear", title: "Tax Year", type: "number" }),
    defineField({ name: "grantPurpose", title: "Grant Purpose", type: "text" }),
    defineField({
      name: "matchConfidence",
      title: "Match Confidence",
      type: "number",
      description:
        "0.0-1.0, from source dataset. Only tier A/B rows should be seeded.",
    }),
    defineField({
      name: "matchTier",
      title: "Match Tier",
      type: "string",
      options: { list: ["A", "B", "C", "D", "U"] },
    }),
    defineField({
      name: "sourceObjectId",
      title: "Source Filing Object ID",
      type: "string",
      description:
        "IRS OBJECT_ID of the source filing — provenance/citation key.",
    }),
  ],
});
