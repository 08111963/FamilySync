import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/query-client";

let ioClient: any = null;
let ioLoaded = false;

function getIO() {
  if (!ioLoaded) {
    ioLoaded = true;
    try {
      ioClient = require("socket.io-client").io;
    } catch {
      ioClient = null;
    }
  }
  return ioClient;
}

export function useWebSocket(familyId: string | null, accessToken: string | null) {
  const qc = useQueryClient();
  const socketRef = useRef<any>(null);

  const invalidateFamily = useCallback(() => {
    if (!familyId) return;
    qc.invalidateQueries({ queryKey: ["/api/families", familyId] });
    qc.invalidateQueries({ queryKey: ["/api/calendar", familyId] });
    qc.invalidateQueries({ queryKey: ["/api/shopping", familyId, "lists"] });
    qc.invalidateQueries({ queryKey: ["/api/chores", familyId] });
  }, [familyId, qc]);

  useEffect(() => {
    if (!familyId || !accessToken) return;

    const io = getIO();
    if (!io) return;

    const baseUrl = getApiUrl();
    let socket: any = null;

    try {
      socket = io(baseUrl, {
        auth: { token: accessToken },
        transports: ["websocket", "polling"],
      });

      socketRef.current = socket;

      socket.on("connect", () => {
        socket?.emit("join_family", familyId);
      });

      const events = [
        "event_created", "event_updated", "event_deleted",
        "shopping_list_created", "shopping_list_deleted",
        "shopping_item_added", "shopping_item_toggled", "shopping_item_deleted",
        "chore_created", "chore_updated", "chore_completed", "chore_deleted",
        "member_joined", "member_updated", "member_removed",
        "family_updated",
      ];

      events.forEach((event) => {
        socket?.on(event, () => {
          invalidateFamily();
        });
      });

      socket.on("connect_error", (err: any) => {
        console.log("WebSocket connection error:", err.message);
      });
    } catch (err) {
      console.log("WebSocket setup error:", err);
    }

    return () => {
      if (socket) {
        if (familyId) socket.emit("leave_family", familyId);
        socket.disconnect();
      }
      socketRef.current = null;
    };
  }, [familyId, accessToken, invalidateFamily]);
}
