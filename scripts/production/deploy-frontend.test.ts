import { describe, expect, it } from "vitest"
import { frontendDeployArguments } from "./deploy-frontend"

describe("production:deploy:frontend", () => {
  it("validates without changing the Worker or Container", () => {
    expect(frontendDeployArguments("abc123", true)).toEqual([
      "deploy",
      "--dry-run",
      "--strict",
      "--containers-rollout",
      "none",
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
})
