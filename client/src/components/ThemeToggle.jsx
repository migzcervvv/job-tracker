import { useTheme } from "../theme/ThemeProvider.jsx";
import { Icon } from "./Icon.jsx";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      className="btn-secondary theme-toggle"
      onClick={toggleTheme}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
    >
      <Icon name={next === "light" ? "sun" : "moon"} size={18} />
      <span>{next === "light" ? "Light mode" : "Dark mode"}</span>
    </button>
  );
}
