import React, { createContext, useContext, useEffect, useState } from "react";

export type Theme = "light" | "dark" | "sepia";

interface ThemeContextType {
  theme: Theme;
  toggleTheme?: () => void;
  setTheme: (theme: Theme) => void;
  switchable: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  switchable?: boolean;
}

export function ThemeProvider({
  children,
  defaultTheme = "light",
  switchable = true,
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem("theme");
    return (stored as Theme) || defaultTheme;
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("dark", "sepia");
    
    if (theme === "dark") {
      root.classList.add("dark");
    } else if (theme === "sepia") {
      root.classList.add("sepia");
    }

    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setThemeState(prev => {
      if (prev === "light") return "dark";
      if (prev === "dark") return "sepia";
      return "light";
    });
  };

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme, switchable }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
