declare module "eslint-plugin-react/configs/recommended.js" {
  import { type Linter } from "eslint"
  const config: Linter.FlatConfig
  export = config
}

declare module "eslint-plugin-react/configs/jsx-runtime.js" {
  import { type Linter } from "eslint"
  const config: Linter.FlatConfig
  export = config
}

declare module "eslint-plugin-unused-imports" {
  import { type ESLint } from "eslint"
  const plugin: ESLint.Plugin
  export = plugin
}

declare module "eslint-plugin-react-refresh" {
  import { type ESLint } from "eslint"
  const plugin: ESLint.Plugin
  export = plugin
}
