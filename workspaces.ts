#!/usr/bin/env bun
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import glob from "fast-glob";
import { type PackageJson } from "type-fest";

const getSystemRootDir = () => path.parse(process.cwd()).root;

const PACKAGE_JSON = "package.json";
const homeDir = process.env["HOME"] ?? getSystemRootDir();

const getRootPackageJson = (dir: string) => {
  let rootPackageJson: string | undefined = undefined,
    parentDir = path.dirname(dir);

  while (path.relative(dir, homeDir) !== "" && parentDir !== dir) {
    const packageJson = path.join(dir, PACKAGE_JSON);
    if (fs.existsSync(packageJson)) rootPackageJson = packageJson;
    dir = parentDir;
    parentDir = path.dirname(dir);
  }

  return rootPackageJson;
};

const isPackageDir = (dir: string) => {
  const packageJson = path.join(dir, PACKAGE_JSON);
  return fs.existsSync(packageJson);
};

export const getWorkspaces = () => {
  const currentDir = process.cwd();
  const workspacePackageJsonPath = getRootPackageJson(currentDir);
  if (!workspacePackageJsonPath) {
    throw new Error(`Root "package.json" not found: ${currentDir}`);
  }
  const rootWorkspaceDir = path.dirname(workspacePackageJsonPath);

  const workspacePackageJson = JSON.parse(
    fs.readFileSync(workspacePackageJsonPath, "utf-8")
  ) as PackageJson;
  assert(
    !!workspacePackageJson.workspaces &&
      typeof workspacePackageJson.workspaces === "object" &&
      "packages" in workspacePackageJson.workspaces
  );

  const workspacePackageGlobs = workspacePackageJson.workspaces.packages;
  const workspacePackagePaths = workspacePackageGlobs.flatMap((packageGlob) => {
    const result = glob.sync(packageGlob, {
      absolute: true,
      cwd: rootWorkspaceDir,
      onlyDirectories: true,
    });
    return result.filter(isPackageDir);
  });

  const workspacePackagesEntries = workspacePackagePaths.reduce<
    Array<[name: string, { path: string; json: PackageJson }]>
  >((result, workspacePackagePath) => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(workspacePackagePath, PACKAGE_JSON), "utf-8")
    ) as PackageJson;
    if (packageJson.name) {
      result.push([
        packageJson.name,
        {
          path: workspacePackagePath,
          json: packageJson,
        },
      ]);
    }
    return result;
  }, []);
  workspacePackagesEntries.sort((a, b) => a[0].localeCompare(b[0]));
  const workspacePackages = Object.fromEntries(workspacePackagesEntries);

  delete workspacePackages["tree-sitter-rtf"];

  const workspaceDependencies = Object.entries(
    workspacePackages
  ).reduce<WorkspaceDependencies>((result, [name, packageJson]) => {
    const dependencies = (result[name] ??= []);
    Object.entries(packageJson.json.dependencies ?? {}).forEach(
      ([name, _version]) => {
        if (name in workspacePackages) dependencies.push(name);
      }
    );
    Object.entries(packageJson.json.devDependencies ?? {}).forEach(
      ([name, _version]) => {
        if (name in workspacePackages) dependencies.push(name);
      }
    );
    dependencies.sort();
    return result;
  }, {});

  const rootProjects = getRootProjects(workspaceDependencies);
  const dependencyOrder = rootProjects.flatMap((x) => x);

  // const packages = Object.keys(workspacePackages);
  // packages.sort();

  return {
    rootDir: rootWorkspaceDir,
    rootPackageJson: workspacePackageJsonPath,
    packages: workspacePackages,
    rootProjects,
    dependencyOrder,
  };
};

export type Workspaces = ReturnType<typeof getWorkspaces>;

type WorkspaceDependencies = {
  [name: string]: string[];
};

const getRootProjects = (packageDependencies: WorkspaceDependencies) => {
  packageDependencies = structuredClone(packageDependencies);

  const rootProjects: string[][] = [];
  let changed = true;
  while (
    changed &&
    Object.values(packageDependencies).some(
      (dependencies) => !dependencies.length
    )
  ) {
    const nextRootProjects = Object.entries(packageDependencies)
      .filter(([_name, dependencies]) => !dependencies.length)
      .map(([name]) => name);
    nextRootProjects.forEach(
      (rootProject) => delete packageDependencies[rootProject]
    );
    changed = !!nextRootProjects.length;
    if (changed) {
      rootProjects.push(nextRootProjects);
      Object.values(packageDependencies).forEach((dependencies) => {
        const newDependencies = dependencies.filter(
          (dependency) => !nextRootProjects.includes(dependency)
        );

        dependencies.length = 0;
        dependencies.push(...newDependencies);
      });
    }
  }

  if (Object.keys(packageDependencies).length) {
    throw new Error(
      `Circular dependency detected:\n${JSON.stringify(packageDependencies, undefined, 2)}`
    );
  }

  return rootProjects;
};

if (import.meta.path === Bun.main) {
  const workspaces = getWorkspaces();
  console.log(JSON.stringify(workspaces, undefined, 2));
}
