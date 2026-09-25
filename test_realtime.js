const { io } = require("socket.io-client");

async function run() {
  const serverUrl = "http://localhost:3001";

  const host = io(serverUrl);
  const mod = io(serverUrl);
  const participant = io(serverUrl);

  const awaitEvent = (socket, event) => new Promise(resolve => {
    socket.once(event, resolve);
  });

  try {
    // 1. Host creates room
    let roomId;
    host.emit("create_room", { username: "Alice" }, (res) => {
      roomId = res.roomId;
    });
    
    await new Promise(r => setTimeout(r, 500));
    console.log("Room created:", roomId);

    // 2. Mod and Participant join
    mod.emit("join_room", { roomId, username: "Bob" });
    participant.emit("join_room", { roomId, username: "Charlie" });
    
    await new Promise(r => setTimeout(r, 500));
    
    // Assign role to Bob
    host.emit("assign_role", { userId: mod.id, role: "Moderator" });
    await new Promise(r => setTimeout(r, 500));

    let eventCount = 0;
    const countEvents = () => { eventCount++; };
    host.on("change_video", countEvents);
    mod.on("change_video", countEvents);
    participant.on("change_video", countEvents);
    
    console.log("Testing Host changing video...");
    host.emit("change_video", { videoId: "dQw4w9WgXcQ" });
    await new Promise(r => setTimeout(r, 500));
    if (eventCount !== 3) throw new Error(`Host change_video failed. Expected 3 events, got ${eventCount}`);
    
    eventCount = 0;
    console.log("Testing Mod changing video...");
    mod.emit("change_video", { videoId: "12345678901" });
    await new Promise(r => setTimeout(r, 500));
    if (eventCount !== 3) throw new Error(`Mod change_video failed. Expected 3 events, got ${eventCount}`);
    
    eventCount = 0;
    console.log("Testing Participant changing video directly...");
    participant.emit("change_video", { videoId: "abcdefghijk" });
    await new Promise(r => setTimeout(r, 500));
    if (eventCount !== 0) throw new Error(`Participant bypassed auth! Expected 0 events, got ${eventCount}`);
    
    // Participant sends request
    console.log("Testing Participant request_action...");
    participant.emit("request_action", { type: "change_video", videoId: "abcdefghijk" });
    await new Promise(r => setTimeout(r, 500));
    
    console.log("All real-time tests passed!");
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
