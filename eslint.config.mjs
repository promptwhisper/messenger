import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "public/**",
  ]),
  {
    files: ["src/components/r3f/**/*.{ts,tsx}"],
    rules: {
      // Three.js scene objects are intentionally mutated inside useFrame.
      "react-hooks/immutability": "off",
    },
  },
]);

export default eslintConfig;
