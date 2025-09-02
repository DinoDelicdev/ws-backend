// server.js
import { WebSocketServer } from "ws";
import { parse } from "url";
import { randomUUID } from "crypto";

const PORT = 8081;
const wss = new WebSocketServer({ port: PORT });
const rooms = new Map();
console.log(`✅ WebSocket server is running on ws://localhost:${PORT}`);

function broadcastRoomUpdate(roomId) {
  const roomData = rooms.get(roomId);
  if (!roomData) return;
  const playerCount = roomData.players.filter((p) => p !== null).length;
  const message = JSON.stringify({ type: "ROOM_UPDATE", count: playerCount });
  for (const client of roomData.players) {
    if (client && client.readyState === 1) client.send(message);
  }
}

wss.on("connection", (ws, req) => {
  const pathname = parse(req.url).pathname;
  const roomId = pathname.substring(1);
  if (!roomId) {
    ws.close();
    return;
  }

  ws.id = randomUUID();
  if (!rooms.has(roomId)) {
    rooms.set(roomId, { players: [null, null], gameState: null });
  }
  const roomData = rooms.get(roomId);
  const playerIndex = roomData.players.indexOf(null);

  if (playerIndex === -1) {
    ws.close(1008, "Room is full");
    return;
  }
  ws.playerIndex = playerIndex;
  roomData.players[playerIndex] = ws;
  broadcastRoomUpdate(roomId);

  ws.on("message", (message) => {
    const parsedMessage = JSON.parse(message);
    const roomData = rooms.get(roomId);
    if (!roomData || roomData.gameState) return;

    const initiator = ws;
    const otherPlayer = roomData.players.find((p) => p && p.id !== initiator.id);
    if (!otherPlayer) return;

    const { gameType, role: initiatorRole } = parsedMessage.payload;
    const otherPlayerRole = initiatorRole === "sender" ? "receiver" : "sender";
    roomData.gameState = { gameType, players: { [initiator.id]: initiatorRole, [otherPlayer.id]: otherPlayerRole } };

    switch (parsedMessage.type) {
      // This is sent by the HOST from the homepage
      case "START_GAME":
        console.log(`HOST is starting game in room ${roomId}`);
        // Both players are on the homepage, so both need a standard `GAME_STARTED` signal to navigate
        initiator.send(
          JSON.stringify({
            type: "GAME_STARTED",
            payload: { gameType, role: initiatorRole },
          })
        );
        otherPlayer.send(
          JSON.stringify({
            type: "GAME_STARTED",
            payload: { gameType, role: otherPlayerRole },
          })
        );
        break;

      // This is sent by the JOINER from the game page
      case "JOIN_AND_INITIATE_GAME":
        console.log(`JOINER is starting game in room ${roomId}`);
        // The initiator is already on the game page, they just need confirmation
        initiator.send(
          JSON.stringify({
            type: "GAME_STARTED",
            payload: { gameType, role: initiatorRole },
          })
        );
        // The other player (host) is on the homepage and needs to be force-redirected
        const redirectUrl = `/game/${roomId}?gameType=${gameType}&role=${otherPlayerRole}`;
        otherPlayer.send(
          JSON.stringify({
            type: "REDIRECT_TO_GAME",
            payload: { url: redirectUrl },
          })
        );
        break;
    }
  });

  ws.on("close", () => {
    const roomData = rooms.get(roomId);
    if (roomData && ws.playerIndex !== undefined) {
      roomData.players[ws.playerIndex] = null;
      const playerCount = roomData.players.filter((p) => p !== null).length;
      if (playerCount === 0) {
        rooms.delete(roomId);
      } else {
        roomData.gameState = null;
        broadcastRoomUpdate(roomId);
      }
    }
  });
});
