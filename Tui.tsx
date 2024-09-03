import { parseArgs } from "node:util"
import { useState, useEffect } from "react"
import { Newline, Text, useApp } from "ink"
import Spinner from "ink-spinner"
import { getWorkspaces } from "./workspaces"
import { run, Status } from "./run"

export const Tui = () => {
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

    const options = (() => {
      const {
        values: { build, test, lint },
      } = parseArgs({
        options: {
          build: {
            type: "boolean",
            short: "b",
          },
          test: {
            type: "boolean",
            short: "t",
          },
          lint: {
            type: "boolean",
            short: "l",
          },
        },
      })
      // The default is to run all
      if (typeof build === "undefined" && typeof test === "undefined" && typeof lint === "undefined") {
        return {
          build: true,
          test: true,
          lint: true,
        }
      }
      return {
        build: !!build,
        test: !!test,
        lint: !!lint,
      }
    })()

    // eslint-disable-next-line @typescript-eslint/no-floating-promises -- Fire and forget
    run(options, (project, script, status, output = "") => {
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
