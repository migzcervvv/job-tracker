import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ThemeProvider } from "../src/theme/ThemeProvider.jsx";
import { ThemeToggle } from "../src/components/ThemeToggle.jsx";

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

function show() {
  return render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>,
  );
}

it("defaults to dark and persists a switch to the softer light palette", () => {
  show();
  expect(document.documentElement.dataset.theme).toBe("dark");
  fireEvent.click(screen.getByRole("button", { name: "Switch to light mode" }));
  expect(document.documentElement.dataset.theme).toBe("light");
  expect(document.documentElement.style.colorScheme).toBe("light");
  expect(localStorage.getItem("jobtracker-theme")).toBe("light");
  expect(
    screen.getByRole("button", { name: "Switch to dark mode" }),
  ).toBeTruthy();
});

it("restores the saved theme after remounting", () => {
  localStorage.setItem("jobtracker-theme", "light");
  const view = show();
  expect(document.documentElement.dataset.theme).toBe("light");
  fireEvent.click(screen.getByRole("button", { name: "Switch to dark mode" }));
  view.unmount();
  show();
  expect(document.documentElement.dataset.theme).toBe("dark");
});

it("still switches themes when browser storage is blocked", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  show();
  fireEvent.click(screen.getByRole("button", { name: "Switch to light mode" }));
  expect(document.documentElement.dataset.theme).toBe("light");
});

it("synchronizes theme changes from another tab", () => {
  show();
  localStorage.setItem("jobtracker-theme", "light");
  fireEvent(
    window,
    new StorageEvent("storage", { key: "jobtracker-theme", newValue: "light" }),
  );
  expect(document.documentElement.dataset.theme).toBe("light");
});

it("uses dark mode for an invalid saved preference", () => {
  localStorage.setItem("jobtracker-theme", "invalid");
  show();
  expect(document.documentElement.dataset.theme).toBe("dark");
});
