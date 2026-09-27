import { defineField, defineType } from "sanity";

export default defineType({
  name: "organization",
  title: "Organization",
  type: "document",
  fields: [
    defineField({
      name: "ein",
      title: "EIN",
      type: "string",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "name",
      title: "Name",
      type: "string",
      validation: (Rule) => Rule.required(),
    }),
    defineField({ name: "state", title: "State", type: "string" }),
    defineField({
      name: "nteeCode",
      title: "NTEE Code",
      type: "string",
      description:
        "Sector classification, e.g. T31 = Foundations & Grantmakers",
    }),
    defineField({
      name: "subsectionCode",
      title: "IRC Subsection",
      type: "string",
      description: "e.g. 501(c)(3)",
    }),
  ],
});
