import { useCallback, useState } from "react";

export function useSinoFullScreen() {
  const [open, setOpen] = useState(false);
  const openFullScreen = useCallback(() => setOpen(true), []);
  const closeFullScreen = useCallback(() => setOpen(false), []);
  return { isFullScreenOpen: open, openFullScreen, closeFullScreen };
}
