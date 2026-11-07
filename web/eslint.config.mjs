import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import isramarket from "./eslint-rules/copy-spacing.mjs";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Translated copy must not be glued to the value beside it ("שבוע3", "לפני כן:1,710").
    files: ["app/**/*.tsx", "components/**/*.tsx"],
    plugins: { isramarket },
    rules: { "isramarket/copy-spacing": "error" },
  },
  {
    // Design pass part 2: these files have open drafts, so their glued copy is fixed there.
    // Remove each file from this list once it is fixed; the rule is an error everywhere else.
    files: [
      "app/dashboard/page.tsx",
      "app/integrations/page.tsx",
      "app/performance/page.tsx",
      "app/promotion/page.tsx",
      "app/strategy/page.tsx",
      "components/PostEditor.tsx",
      "components/integrations/MetaConnection.tsx",
      "components/integrations/PixelSetupGuide.tsx",
      "components/plan/QuarterPlanView.tsx",
      "components/trial/TrialGuide.tsx",
    ],
    rules: { "isramarket/copy-spacing": "warn" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
