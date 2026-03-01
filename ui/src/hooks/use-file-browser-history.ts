import { useCallback, useEffect, useRef } from 'react';

const HISTORY_KEY = 'bench-file-browser';

interface HistoryState {
  path: string;
  root: string | null;
}

function getHistoryState(): HistoryState | null {
  const s = history.state;
  if (s && typeof s === 'object' && HISTORY_KEY in s) {
    const v = (s as Record<string, HistoryState>)[HISTORY_KEY];
    if (v && typeof v.path === 'string') {
      return { path: v.path, root: typeof v.root === 'string' ? v.root : null };
    }
  }
  return null;
}

function pushState(path: string, root: string | null) {
  const url = `${window.location.pathname}${window.location.search}#resources`;
  history.pushState({ [HISTORY_KEY]: { path, root } }, '', url);
}

function replaceState(path: string, root: string | null) {
  const url = `${window.location.pathname}${window.location.search}#resources`;
  history.replaceState({ [HISTORY_KEY]: { path, root } }, '', url);
}

export function useFileBrowserHistory(
  path: string,
  setPath: (p: string) => void,
  root: string | null,
  setRoot: (r: string | null) => void,
  isActive: boolean
) {
  const initialReplaceDoneRef = useRef(false);

  useEffect(() => {
    if (!isActive || !root) return;

    if (!initialReplaceDoneRef.current) {
      replaceState(path, root);
      initialReplaceDoneRef.current = true;
    }
  }, [isActive, root, path]);

  useEffect(() => {
    if (!isActive) return;

    const onPopState = () => {
      const state = getHistoryState();
      if (state) {
        setPath(state.path);
        if (state.root) {
          setRoot(state.root);
        }
      }
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [isActive, setPath, setRoot]);

  const handleNavigate = useCallback(
    (newPath: string) => {
      pushState(newPath, root);
      setPath(newPath);
    },
    [root, setPath]
  );

  const handleRootChange = useCallback(
    (newRoot: string, pathForRoot: string = '.') => {
      pushState(pathForRoot, newRoot);
      setRoot(newRoot);
      setPath(pathForRoot);
    },
    [setRoot, setPath]
  );

  return { handleNavigate, handleRootChange };
}
