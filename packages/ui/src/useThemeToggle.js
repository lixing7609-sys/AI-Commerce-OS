import { useEffect, useState } from "react";

const STORAGE_KEY = "sinofut-theme";

export function useThemeToggle() {
  const [theme, setTheme] = useState(() => {
    if (typeof window === "undefined") return "system";
    return window.localStorage.getItem(STORAGE_KEY) || "system";
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") {
      root.removeAttribute("data-theme");
    } else {
      root.setAttribute("data-theme", theme);
    }
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggle = () => {
    setTheme((current) => {
      if (current === "system") return "dark";
      if (current === "dark") return "light";
      return "system";
    });
  };

  return { theme, toggle };
}
