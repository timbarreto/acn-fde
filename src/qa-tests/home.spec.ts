import { expect, test } from "@playwright/test"

test("renders the home page", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" })

  await expect(page).toHaveTitle("Agentic Ready — GH-600 Practice")
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Practice the judgment behind agentic systems.",
    }),
  ).toBeVisible()
  await expect(page.getByRole("button", { name: "Start a practice exam" })).toBeVisible()
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible()
})
