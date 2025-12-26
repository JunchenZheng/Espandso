export interface OpenSourceLibrary {
  name: string;
  url: string;
  license: string;
  description: string;
  usageNotice?: string;
}

export const OPEN_SOURCE_LIBRARIES: OpenSourceLibrary[] = [
  {
    name: "isbinaryfile",
    url: "https://github.com/gjtorikian/isbinaryfile",
    license: "MIT",
    description:
      "Detects whether a file is binary or text by checking byte signatures, BOMs, and control character ratios.",
    usageNotice: "Binary file detection logic in src/logic/fileCheck.ts.",
  },
  {
    name: "shadcn/ui",
    url: "https://github.com/shadcn-ui/ui",
    license: "MIT",
    description:
      "Beautifully designed components built with Radix UI and Tailwind CSS. Accessible, customizable, open source.",
    usageNotice: "UI primitives and design system in src/components/ui/.",
  },
];
