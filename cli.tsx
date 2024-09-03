#!/usr/bin/env bun
import { render } from "ink"
import { Tui } from "./Tui"

if (import.meta.path === Bun.main) {
  render(<Tui />)
}
