import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { AuthProvider } from "./lib/auth.tsx";
import { Analytics } from "@vercel/analytics/react";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode><AuthProvider><App /></AuthProvider>{import.meta.env.VERCEL && <Analytics />}</StrictMode>,
);
