import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // Phase 20 (URL-03): block raw customer-facing admin URLs outside src/lib/urls.ts.
  // After Phase 25 cutover, customer-facing URLs must point at portal.triarch.dev;
  // the helper module src/lib/urls.ts is the sole legal source. CI fails on any
  // raw 'admin.triarch.dev/projects/' literal that bypasses the helper.
  {
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/admin\\.triarch\\.dev\\/projects/]",
          message:
            "Customer-facing URLs must go through src/lib/urls.ts helpers (customerProjectUrl, customerReleaseUrl, customerBugUrl, customerFeatureUrl). Raw 'admin.triarch.dev/projects/' literals are blocked — see Phase 20 / URL-03.",
        },
        {
          selector: "TemplateElement[value.raw=/admin\\.triarch\\.dev\\/projects/]",
          message:
            "Customer-facing URLs must go through src/lib/urls.ts helpers (customerProjectUrl, customerReleaseUrl, customerBugUrl, customerFeatureUrl). Raw 'admin.triarch.dev/projects/' template literals are blocked — see Phase 20 / URL-03.",
        },
      ],
    },
  },
  // Exempt src/lib/urls.ts itself — it is the legal source of these strings,
  // and any future helper additions will reference the literal pattern.
  // Also exempt eslint.config.mjs — the rule selector strings contain the
  // pattern as a regex fragment and would otherwise trigger against themselves.
  {
    files: ["src/lib/urls.ts", "src/lib/urls.test.ts", "eslint.config.mjs"],
    rules: {
      "no-restricted-syntax": "off",
    },
  },
]);

export default eslintConfig;
