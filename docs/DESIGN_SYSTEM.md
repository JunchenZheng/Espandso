# Expandso UI Design System & Typography Guidelines

This document defines the UI design principles, typography hierarchy scale, and component styling mapping for the Expandso Desktop application.

---

## 1. Design Principles

1. **Clear Visual Hierarchy**: Establish distinct typography levels for page hero titles, section headings, card & dialog titles, body content, and secondary caption text.
2. **Premium Desktop Experience**: Utilize modern HSL color tokens, subtle micro-interactions, smooth backdrop blurs, and polished dark/light themes.
3. **Component Consistency**: Ensure all UI controls (buttons, input fields, labels, dialogs, cards) strictly adhere to design system tokens rather than ad-hoc inline font declarations.

---

## 2. Typography Scale & Hierarchy

The baseline font size is `16px = 1rem`. The system is divided into 7 standardized typography levels:

| Level / Component | Recommended Size (px) | rem Unit (16px base) | Tailwind Class | Font Weight | Usage & Examples |
| --- | --- | --- | --- | --- | --- |
| **Hero Title (H1)** | 32px ~ 36px | 2rem ~ 2.25rem | `text-3xl` / `text-4xl` | Bold (700) | Primary top-level title, Hero banner title |
| **Section Title (H2)** | 24px ~ 28px | 1.5rem ~ 1.75rem | `text-2xl` / `text-[28px]` | SemiBold (600) / Bold (700) | Section headings, active YAML file header, empty state titles |
| **Subtitle / Group (H3)** | 18px ~ 20px | 1.125rem ~ 1.25rem | `text-lg` / `text-xl` | SemiBold (600) / Bold (700) | Card titles, Modal/Dialog titles, Sidebar group headers (`Collection`) |
| **Body / Base (Standard)** | 16px | 1rem | `text-base` | Regular (400) | Main baseline: paragraph text, form inputs (`Input`, `Textarea`), standard buttons |
| **Body Small** | 14px | 0.875rem | `text-sm` | Regular (400) / Medium (500) | Form labels (`Label`), table data, secondary list text, small buttons (`sm`) |
| **Caption / Help** | 12px | 0.75rem | `text-xs` | Regular (400) | Help text, input validation error messages, timestamps, tags, terminal logs |
| **Micro Badge** | 10px ~ 11px | 0.625rem | `text-[11px]` / `text-[10px]` | Medium (500) / SemiBold (600) | Badge counts, numerical indicators, micro tags (use sparingly) |

---

## 3. Component-Level Typography Mapping

### 3.1 Base UI Primitives (`src/components/ui/`)

- **Button ([button.tsx](file:///Volumes/Sandisk2TB/CodeProject/Espanso_yaml_to_json/src/components/ui/button.tsx))**:
  - `default`, `outline`, `secondary`, `destructive`: `text-base font-medium` (16px).
  - `sm` (Small): `text-sm font-medium` (14px).
  - `icon`: Icon sizing matches outer dimensions (`h-8 w-8` or `h-9 w-9`).

- **Input & Textarea ([input.tsx](file:///Volumes/Sandisk2TB/CodeProject/Espanso_yaml_to_json/src/components/ui/input.tsx) / [textarea.tsx](file:///Volumes/Sandisk2TB/CodeProject/Espanso_yaml_to_json/src/components/ui/textarea.tsx))**:
  - Baseline size set to standard body text `text-base` (16px) for comfortable reading and editing.
  - Placeholder text uses `placeholder:text-muted-foreground`.

- **Label ([label.tsx](file:///Volumes/Sandisk2TB/CodeProject/Espanso_yaml_to_json/src/components/ui/label.tsx))**:
  - Form labels use `text-sm font-medium` (14px) with `leading-none`.

- **Dialog / Modal ([dialog.tsx](file:///Volumes/Sandisk2TB/CodeProject/Espanso_yaml_to_json/src/components/ui/dialog.tsx))**:
  - `DialogTitle`: H3 level `text-xl font-semibold` (20px) or `text-lg font-semibold` (18px).
  - `DialogDescription`: Secondary body text `text-sm text-muted-foreground` (14px).

- **Card ([card.tsx](file:///Volumes/Sandisk2TB/CodeProject/Espanso_yaml_to_json/src/components/ui/card.tsx))**:
  - `CardTitle`: H3 level `text-lg font-semibold` (18px).
  - `CardDescription`: `text-sm text-muted-foreground` (14px).

---

### 3.2 Page Views & Modules (`src/App.tsx` & `src/components/`)

- **Top Bar & Stats Header**:
  - Counts and summary text: `text-base` (16px).
  - Warning badges: `text-[11px]` or `text-xs` (12px).

- **Sidebar**:
  - Sidebar collection group header (`Collection`): H3 level `text-lg font-semibold` (18px).
  - YAML file tree items: `text-sm font-medium` (14px).
  - File count badges: Micro level `text-[11px] font-medium text-muted-foreground` (11px).

- **Detail Views & Editors**:
  - Selected YAML relative path header: H2 level `text-xl font-bold` / `text-2xl font-bold` (20px~24px).
  - Absolute file path description: `text-sm text-muted-foreground` (14px).
  - Snippet trigger text: `font-mono text-base font-semibold` (16px).
  - Descriptions and variables (`[[var]]`): `text-sm` / `text-xs` (12px~14px).

- **Empty State**:
  - Title: H2 level `text-2xl font-semibold` (24px).
  - Guidance text: `text-base text-muted-foreground` (16px).

---

## 4. Color Tokens & Theme System

The app utilizes CSS custom variables with HSL color values:

```css
:root {
  --background: 220 24% 97%;
  --foreground: 224 18% 12%;
  --card: 0 0% 100%;
  --card-foreground: 224 18% 12%;
  --primary: 173 80% 28%;
  --primary-foreground: 0 0% 98%;
  --secondary: 214 24% 92%;
  --secondary-foreground: 224 18% 18%;
  --muted: 214 24% 92%;
  --muted-foreground: 218 10% 42%;
  --accent: 35 92% 92%;
  --accent-foreground: 28 72% 25%;
  --destructive: 0 72% 51%;
  --border: 214 18% 84%;
  --input: 214 18% 84%;
  --ring: 173 80% 28%;
  --radius: 0.5rem;
}
```

- **Primary Color (`--primary`)**: Emerald / Deep Teal tone, used for primary actions and active states.
- **Foreground (`--foreground`)**: High contrast dark charcoal, ensuring optimal readability.
- **Muted Foreground (`--muted-foreground`)**: Neutral mid-gray for secondary text, descriptions, and timestamps.

---

## 5. Development Guidelines

1. **New UI Components**: Always map text sizes against the 7-level typography scale using appropriate Tailwind `text-*` classes.
2. **Form Controls**: Always use primitive components from `src/components/ui/` (`Button`, `Input`, `Textarea`, `Label`) instead of raw unstyled HTML elements.
3. **Internationalization (i18n)**: Account for varying text lengths in different locales. Use text truncation (`truncate`) where applicable to prevent layout breaks.
