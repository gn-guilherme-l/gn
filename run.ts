#!/usr/bin/env bun
import { execFile } from "node:child_process"
import * as path from "node:path"
import { getWorkspaces } from "./workspaces"

export enum Status {
  running,
  success,
  error,
  skip,
}

export const run = async (
  options: {
    build?: boolean | undefined
    test?: boolean | undefined
    lint?: boolean | undefined
  },
  onUpdate?: (project: string, script: string, status: Status, output?: string) => void,
) => {
  const { packages, rootProjects, rootDir } = getWorkspaces()

  // TEMP - just XP
  // rootProjects.length = 0
  // rootProjects.push(["good-notes"])

  const runScript = async (project: string, script: string, ...args: string[]) => {
    const scriptCmd = packages[project]?.json.scripts?.[script]
    if (!scriptCmd) {
      onUpdate?.(project, script, Status.success)
      return { status: Status.success }
    }
    onUpdate?.(project, script, Status.running)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const projectPath = packages[project]!.path
    const pathEnv: string[] = [
      path.join(projectPath, "node_modules", ".bin"),
      path.join(rootDir, "node_modules", ".bin"),
    ]
    if (process.env["PATH"]) pathEnv.push(process.env["PATH"])
    const PATH = pathEnv.join(path.delimiter)

    const command = "yarn"
    const commandArgs = ["run", script]
    try {
      const child = execFile(command, [...commandArgs, ...args], {
        cwd: projectPath,
        env: {
          ...process.env,
          PATH,
        },
      })
      const stderr: string[] = []
      const stdout: string[] = []
      child.stdout?.on("data", (data: string) => {
        stdout.push(data.toString())
      })
      child.stderr?.on("data", (data: string) => {
        stderr.push(data.toString())
      })
      return new Promise<{ status: Status }>((resolve) => {
        child.addListener("exit", (code) => {
          code ??= 0
          const status = code === 0 ? Status.success : Status.error
          onUpdate?.(project, script, status, stderr.join("") + stdout.join(""))
          resolve({ status })
        })
      })
    } catch (e) {
      onUpdate?.(
        project,
        script,
        Status.error,
        `${script} ${command} ${[...commandArgs, ...args].join(" ")}\nPATH = ${pathEnv.join(path.delimiter)}\n${JSON.stringify(e)}\n${(e as Error).stack}`,
      )
      return { status: Status.error }
    }
  }

  const promises: Promise<unknown>[] = []

  const lintAndTest = async (project: string) => {
    const promises: Promise<unknown>[] = []
    if (options.lint) promises.push(runScript(project, "lint"))
    if (options.test) promises.push(runScript(project, "test", "--run", "--passWithNoTests"))
    await Promise.all(promises)
  }

  if (options.build) {
    for (const projects of rootProjects) {
      // Await dependencies of dependencies to build first in the project tree
      await Promise.all(
        projects.map(async (project) =>
          runScript(project, "build").then(({ status }) => {
            if (status === Status.success) {
              promises.push(lintAndTest(project))
            }
          }),
        ),
      )
    }
  } else {
    for (const projects of rootProjects) {
      for (const project of projects) {
        promises.push(lintAndTest(project))
      }
    }
  }

  await Promise.all(promises)
}
