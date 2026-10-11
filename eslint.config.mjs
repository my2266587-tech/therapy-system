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
  {
    rules: {
      // Pages load their data with `useEffect(() => { load(); }, [load])`, and
      // load() starts with setLoading(true). On mount that state is already
      // true, so React bails out — no real cascading render. Kept visible as a
      // warning (prefer event handlers / derived state in new code) so that
      // genuine errors aren't drowned out.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
