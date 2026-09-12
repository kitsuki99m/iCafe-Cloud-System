import { useCallback, useEffect, useRef, useState } from "react";
import { testCurrentServerConfig } from "../lib/serverConfig.js";
import { showToast } from "../lib/toast.js";
import { isCloudAdmin } from "../lib/cloudClient.js";

const POLL_INTERVAL_MS = 15000;

// Possible statuses:
//   'connecting' - a health check is currently in flight (first load or retry)
//   'online'     - the backend answered successfully
//   'offline'    - the browser itself has no network connection
//   'error'      - the browser is online but the backend didn't respond OK
export function useBackendStatus() {
  const cloud = isCloudAdmin();
  const [status, setStatus] = useState(() => cloud ? "online" :
    typeof navigator !== "undefined" && navigator.onLine === false
      ? "offline"
      : "connecting",
  );
  const aliveRef = useRef(true);
  const timerRef = useRef(null);
  const prevStatusRef = useRef(status);
  const requestSequenceRef = useRef(0);

  const check = useCallback(async ({ showConnecting = false } = {}) => {
    if (cloud) { if (aliveRef.current) setStatus("online"); return; }
    const requestId = ++requestSequenceRef.current;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      if (aliveRef.current && requestId === requestSequenceRef.current) setStatus("offline");
      return;
    }
    if (showConnecting && aliveRef.current) setStatus("connecting");
    try {
      await testCurrentServerConfig();
      if (!aliveRef.current || requestId !== requestSequenceRef.current) return;
      setStatus("online");
    } catch {
      if (!aliveRef.current || requestId !== requestSequenceRef.current) return;
      setStatus("error");
    }
  }, [cloud]);

  const retry = useCallback(() => {
    check({ showConnecting: true });
  }, [check, cloud]);

  useEffect(() => {
    aliveRef.current = true;
    if (cloud) { setStatus("online"); return () => { aliveRef.current = false; }; }
    check({ showConnecting: true });

    timerRef.current = window.setInterval(
      () => check({ showConnecting: false }),
      POLL_INTERVAL_MS,
    );

    function handleOnline() {
      check({ showConnecting: true });
    }
    function handleOffline() {
      if (aliveRef.current) setStatus("offline");
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      aliveRef.current = false;
      requestSequenceRef.current += 1;
      window.clearInterval(timerRef.current);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [check]);

  // Toast only on the transition INTO an error state, not on every poll
  // while it stays broken.
  useEffect(() => {
    if (status === "error" && prevStatusRef.current !== "error") {
      showToast({
        title: "Can't reach the server",
        message: "Check that the backend is running, then retry.",
        tone: "error",
      });
    }
    prevStatusRef.current = status;
  }, [status]);

  return { status, retry };
}
