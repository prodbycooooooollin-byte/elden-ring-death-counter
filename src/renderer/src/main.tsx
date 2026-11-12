import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { App } from "./App";
import { AppProvider } from "./lib/store";
import { TooltipProvider } from "./components/ui";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProvider>
      <TooltipProvider>
        <App />
      </TooltipProvider>
    </AppProvider>
  </StrictMode>,
);
