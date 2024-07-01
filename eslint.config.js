import * as path from "node:path"
import { fileURLToPath } from "node:url"
import globals from "globals"
import eslint from "@eslint/js"
import tseslint from "typescript-eslint"
import reactRecommended from "eslint-plugin-react/configs/recommended.js"
import reactJsxRuntime from "eslint-plugin-react/configs/jsx-runtime.js"
import reactRefresh from "eslint-plugin-react-refresh"
import prettier from "eslint-config-prettier"
import { FlatCompat } from "@eslint/eslintrc"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const compat = new FlatCompat({
  baseDirectory: __dirname,
  resolvePluginsRelativeTo: __dirname,
})

export default tseslint.config(
  {
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  eslint.configs.recommended,

  ...tseslint.configs.strictTypeChecked,

  reactRecommended,
  reactJsxRuntime,
  {
    settings: {
      react: {
        version: "18",
      },
    },
    rules: {
      // No need for prop-types with TS
      "react/prop-types": "off",
    },
  },

  ...compat.extends("plugin:react-hooks/recommended"),

  // eslint-plugin-react-refresh
  {
    plugins: {
      "react-refresh": reactRefresh,
    },
    rules: {
      "react-refresh/only-export-components": [
        "warn",
        {
          allowConstantExport: true,
        },
      ],
    },
  },

  // eslint-plugin-unused-imports
  ...compat.plugins("unused-imports"),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "error",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],
    },
  },

  // Ignore common output dirs
  {
    ignores: ["dist/", "build/"],
  },

  {
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.json"],
        tsconfigRootDir: __dirname,
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
  },

  prettier,

  {
    rules: {
      eqeqeq: ["error"],
      // Allow numbers in string template expressions
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      // Allow returning `void`
      "@typescript-eslint/no-confusing-void-expression": "off",
      // Bug: https://github.com/typescript-eslint/typescript-eslint/issues/8113
      "@typescript-eslint/no-invalid-void-type": "off",

      "@typescript-eslint/consistent-type-exports": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/require-array-sort-compare": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/method-signature-style": "error",
      "@typescript-eslint/no-unnecessary-qualifier": "error",
      "@typescript-eslint/no-unsafe-unary-minus": "error",
      "@typescript-eslint/prefer-find": "error",
      "@typescript-eslint/prefer-for-of": "error",
      "@typescript-eslint/prefer-readonly": "error",
      "@typescript-eslint/promise-function-async": "error",
    },
  },
)
