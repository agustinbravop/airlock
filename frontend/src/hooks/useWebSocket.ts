import { useCallback, useEffect, useRef, useState } from "react";
import { ServerMessage, ClientMessage } from "../types";

const WS_URL = "ws://localhost:8000/ws";
const MAX_RECONNECT_DELAY = 8000;

export function useWebSocket(onMessage: (msg: ServerMessage) => void) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const onMessageRef = useRef(onMessage);
  const reconnectDelay = useRef(500);
  onMessageRef.current = onMessage;

  const connect = useCallback(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      reconnectDelay.current = 500;
    };

    ws.onclose = () => {
      setConnected(false);
      // Guard: only reconnect if this socket is still the current one.
      // Without this, StrictMode's cleanup+remount cycle sets wsRef to a new
      // socket before the old one's onclose fires — causing a third connection
      // to open alongside the second, which doubles every received token.
      if (wsRef.current === ws) {
        const delay = reconnectDelay.current;
        reconnectDelay.current = Math.min(delay * 2, MAX_RECONNECT_DELAY);
        setTimeout(connect, delay);
      }
    };

    ws.onerror = () => {};

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as ServerMessage;
        onMessageRef.current(msg);
      } catch {}
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      // Null out the ref before closing so onclose sees it's been superseded
      // and skips the reconnect.
      const ws = wsRef.current;
      wsRef.current = null;
      ws?.close();
    };
  }, [connect]);

  const send = useCallback((msg: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  return { send, connected };
}
