#!/usr/bin/env bun
import { execFile } from "node:child_process"
import * as path from "node:path"
import { useState, useEffect } from "react"
import { Newline, render, Text, useApp } from "ink"
import Spinner from "ink-spinner"
import { getWorkspaces } from "./workspaces"

enum Status {
  running,
  success,
  error,
}

const test = async (onUpdate?: (project: string, script: string, status: Status, output?: string) => void) => {
  const workspaces = getWorkspaces()
  const { packages, rootProjects } = workspaces

  // TEMP
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
      path.join(workspaces.rootDir, "node_modules", ".bin"),
    ]
    if (process.env["PATH"]) pathEnv.push(process.env["PATH"])
    const PATH = pathEnv.join(path.delimiter)

    // Special case for XP - Vitest with `--pool=forks` exits before finishing all forks
    let command = "yarn"
    let commandArgs = ["run", script]
    if (script === "test" && scriptCmd.includes("--pool=forks")) {
      const vitest = Bun.which("vitest", {
        cwd: projectPath,
        PATH,
      })
      if (!vitest) {
        throw new Error(`"vitest" command not found in PATH\nCWD=${projectPath}\nPATH=${PATH}`)
      }
      command = vitest
      commandArgs = []
    }

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

  const promises: Promise<void>[] = []

  const lintAndTest = async (project: string) => {
    await Promise.all([
      runScript(project, "lint"),
      runScript(project, "test", "--run", "--passWithNoTests"),
    ])
  }

  for (const projects of rootProjects) {
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

  await Promise.all(promises)
}

// eslint-disable-next-line react-refresh/only-export-components
const Tui = () => {
  const app = useApp()
  const [done, setDone] = useState(false)
  const [projects, setProjects] = useState<{
    [project: string]: {
      scripts?: {
        [script: string]: {
          status: Status
          output: string
        }
      }
      status?: Status | undefined
    }
  }>({})
  useEffect(() => {
    const { packages } = getWorkspaces()
    const projectsNames = Object.keys(packages)
    const initialProjects = projectsNames.reduce<typeof projects>((result, project) => {
      result[project] = {}
      return result
    }, {})
    setProjects(initialProjects)

    // eslint-disable-next-line @typescript-eslint/no-floating-promises -- Fire and forget
    test((project, script, status, output = "") => {
      setProjects((projects) => {
        const scripts = {
          ...projects[project]?.scripts,
          [script]: {
            ...projects[project]?.scripts?.[script],
            output,
            status,
          },
        }

        const getFinalStatus = () => {
          const statuses = Object.values(scripts).map(({ status }) => status)
          if (statuses.some((status) => status === Status.running)) {
            return Status.running
          }
          if (statuses.some((status) => status === Status.error)) {
            return Status.error
          }
          if (statuses.every((status) => status === Status.success)) {
            return Status.success
          }
          return undefined
        }

        projects = {
          ...projects,
          [project]: {
            scripts,
            status: getFinalStatus(),
          },
        }
        return projects
      })
    }).then(() => {
      setDone(true)
      setTimeout(() => app.exit(), 0)
    })
  }, [app])

  return (
    <>
      {Object.entries(projects).map(([project, status]) => {
        const errorScripts = Object.entries(status.scripts ?? {}).reduce<string[]>((result, [script, { status }]) => {
          if (status === Status.error) result.push(script)
          return result
        }, [])

        const runningScripts = Object.entries(status.scripts ?? {}).reduce<string[]>((result, [script, { status }]) => {
          if (status === Status.running) result.push(script)
          return result
        }, [])

        return (
          <Text key={project}>
            {status.status === Status.running ? (
              <Text color="yellow">
                <Spinner />
              </Text>
            ) : status.status === Status.success ? (
              <Text color="green">✓</Text>
            ) : !status.status ? (
              <Text color="gray">↓</Text>
            ) : (
              <Text color="red">{"\u00d7"}</Text>
            )}
            {` ${project}`}
            {!!errorScripts.length && <Text color={"red"}>{` ${errorScripts.join(" ")}`}</Text>}
            {!!runningScripts.length && <Text color={"gray"}>{` ${runningScripts.join(" ")}`}</Text>}
          </Text>
        )
      })}
      {done && (
        <>
          {Object.entries(projects).map(([project, { scripts }], index) => {
            if (!scripts) return

            return (
              <Text key={index}>
                {Object.entries(scripts).map(([script, { status, output }], index) => {
                  if (!output || status !== Status.error) return

                  return (
                    <Text key={index} color="red">
                      {project} {script}
                      <Newline />
                      {output}
                    </Text>
                  )
                })}
              </Text>
            )
          })}
          <Text>✨ Done</Text>
        </>
      )}
    </>
  )
}

if (import.meta.path === Bun.main) {
  render(<Tui />)
}
