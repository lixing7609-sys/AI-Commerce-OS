import { useCallback, useEffect, useState } from "react";
import { api } from "@sinofut/domain";

export function useApiState(pollMs = 4000) {
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);

  const refresh = useCallback(() => {
    api
      .getState()
      .then((s) => {
        setState(s);
        setError(null);
      })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    refresh();
    if (!pollMs) return undefined;
    const timer = setInterval(refresh, pollMs);
    return () => clearInterval(timer);
  }, [refresh, pollMs]);

  return { state, error, refresh };
}
