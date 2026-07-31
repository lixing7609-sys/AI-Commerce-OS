import { createContext } from "react";

// Split into its own file so FounderAIContext.jsx (the Provider component)
// and useFounderAI.js (the hook) can each export only one thing — keeps
// react-refresh's "only export components" rule happy.
export const FounderAIContext = createContext(null);
