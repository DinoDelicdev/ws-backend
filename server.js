// server.js
import { WebSocketServer } from "ws";
import { parse } from "url";

const PORT = 8081;

// Create a new WebSocket server
const wss = new WebSocketServer({ port: PORT });

// This Map will store our rooms.
// The key is the roomId (a string), and the value is a Set of connected WebSocket clients.
const rooms = new Map();

console.log(`✅ WebSocket server is running on ws://localhost:${PORT}`);

// This function broadcasts a room update to all clients in a specific room
function broadcastRoomUpdate(roomId) {
  const room = rooms.get(roomId);
  if (!room) return; 

  const playerCount = room.size;
  console.log(`Broadcasting to room ${roomId}: ${playerCount} players.`);

  const message = JSON.stringify({
    type: "ROOM_UPDATE",
    count: playerCount,
  });

  // Send the message to every client in the room
  for (const client of room) {
    if (client.readyState === 1) { // 1 means OPEN
      client.send(message);
    }
  }
}

// Set up a connection listener
wss.on("connection", (ws, req) => {
  // Extract the room ID from the connection URL (e.g., /123456 -> 123456)
  const pathname = parse(req.url).pathname;
  const roomId = pathname.substring(1);

  if (!roomId) {
    console.log("Connection attempt without a room ID. Closing.");
    ws.close();
    return;
  }

  console.log(`🔌 New client connected to room: ${roomId}`);

  // If the room doesn't exist yet, create it
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Set());
  }

  // Add the newly connected client to the room
  const room = rooms.get(roomId);
  room.add(ws);

  // Broadcast the new player count to everyone in the room
  broadcastRoomUpdate(roomId);

  // Set up a listener for messages from the client (not used in your frontend, but good practice)
  ws.on("message", (message) => {
    console.log(`Received message in room ${roomId}: ${message}`);
    // Here you could handle game-specific messages, e.g., broadcasting a move
  });

  // Set up a listener for when the client disconnects
  ws.on("close", () => {
    console.log(`🔌 Client disconnected from room: ${roomId}`);

    const room = rooms.get(roomId);
    if (room) {
      // Remove the client from the room
      room.delete(ws);

      // If the room is now empty, we can delete it to save memory
      if (room.size === 0) {
        rooms.delete(roomId);
        console.log(`🗑️ Room ${roomId} is empty and has been deleted.`);
      } else {
        // If there are still players, broadcast the updated player count
        broadcastRoomUpdate(roomId);
      }
    }
  });

  ws.on("error", (error) => {
    console.error(`WebSocket error in room ${roomId}:`, error);
  });
});