import { describe, expect, it } from "vitest"
import {
  assertProductionStateUnchanged,
  frontendDeployArguments,
} from "./deploy-frontend"

describe("production:deploy:frontend", () => {
  it("validates without changing the Worker or Container", () => {
    expect(frontendDeployArguments("abc123", true, "dry-run-output")).toEqual([
      "deploy",
      "--dry-run",
      "--strict",
      "--containers-rollout",
      "none",
      "--outdir",
      "dry-run-output",
    ])
  })

  it("deploys a tagged Worker version without rolling out the Container", () => {
    expect(frontendDeployArguments("abc123", false)).toEqual([
      "deploy",
      "--strict",
      "--containers-rollout",
      "none",
      "--tag",
      "frontend-abc123",
      "--message",
      "Frontend release abc123",
    ])
  })

  it("stops before deployment when the CoreEx image changed", () => {
    expect(() =>
      assertProductionStateUnchanged(
        "worker-version-1",
        "worker-version-1",
        "coreex@sha256:before",
        "coreex@sha256:after",
      ),
    ).toThrow(
      "CoreEx image changed before frontend deployment (coreex@sha256:before -> coreex@sha256:after)",
    )
  })
})
