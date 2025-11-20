/**
 * SNIPEHOME - Real-time WebSocket server for live dashboard
 * Broadcasts all trading events to cyberpunk control room
 */

import { Server } from "socket.io";

const io = new Server(3001, {
  cors: { origin: "*" },
});

console.log("🟢 SNIPEHOME LIVE → ws://localhost:3001 (REAL BOT ACTIVE)");

/**
 * Broadcast any event to the dashboard
 * Call this from anywhere in the bot
 */
export const snipe = (event: string, data?: any) => {
  const payload = {
    time: new Date().toISOString(),
    ...data,
  };
  
  // Emit the original event
  io.emit(event, payload);
  
  // Also emit dashboard-friendly aliases for compatibility
  if (event === 'ai-approved') {
    io.emit('aiApproval', payload);
  } else if (event === 'pnl' && data?.type === 'WIN') {
    io.emit('profitTaken', { profit: data.profit, pnl: data.profitPercent, token: data.token, ...payload });
  } else if (event === 'pnl' && data?.type === 'LOSS') {
    io.emit('stopLoss', { loss: Math.abs(data.profit), token: data.token, ...payload });
  } else if (event === 'market-regime') {
    io.emit('regime', payload);
  } else if (event === 'ai-learning') {
    // 🧠 AI Learning events - show what data is being recorded
    io.emit('aiLearning', payload);
    console.log(`📚 [DASHBOARD] AI Learning: ${data?.pattern || 'N/A'} @ ${data?.rvol || '?'}x RVOL → ${data?.outcome || '?'}`);
  }
};

// Heartbeat so dashboard knows bot is alive
let heartbeatStats = {
  status: "sniping",
  wallet: "connected",
  positions: 0,
  balance: 0,
};

export const updateHeartbeat = (stats: Partial<typeof heartbeatStats>) => {
  heartbeatStats = { ...heartbeatStats, ...stats };
};

setInterval(() => {
  snipe("heartbeat", heartbeatStats);
}, 7000);

// Log connections
io.on("connection", (socket) => {
  console.log("🎨 Dashboard connected:", socket.id);
  
  // Send current state on connect
  snipe("bot-status", {
    message: "SnipeBT AI Trading Bot",
    ...heartbeatStats,
  });
  
  socket.on("disconnect", () => {
    console.log("🔌 Dashboard disconnected:", socket.id);
  });
});
