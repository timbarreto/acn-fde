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

test("keeps the study path focused on GH-600", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" })

  await expect(page.getByText("Prepare for the consultant role, too.")).toHaveCount(0)
  await page.getByRole("button", { name: "View study path" }).click()

  await expect(page.getByRole("heading", { level: 1, name: "Follow the GH-600 blueprint." })).toBeVisible()
  await expect(page.getByText(/Agentic Engineering Consultant/i)).toHaveCount(0)
  await expect(page.getByText(/Integrated capstone/i)).toHaveCount(0)
})
