import { io, type Socket } from 'socket.io-client';

class SocketManager {
  private socket: Socket | null = null;

  connect(token: string) {
    if (this.socket?.connected) return;

    this.socket = io('/', {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    this.socket.on('connect', () => {
      console.log('[Socket] Connected');
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
    });

    this.socket.on('connect_error', (error) => {
      console.error('[Socket] Connection error:', error.message);
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  on(event: string, callback: (...args: unknown[]) => void) {
    this.socket?.on(event, callback);
  }

  off(event: string, callback?: (...args: unknown[]) => void) {
    this.socket?.off(event, callback);
  }

  emit(event: string, ...args: unknown[]) {
    this.socket?.emit(event, ...args);
  }

  get connected() {
    return this.socket?.connected ?? false;
  }
}

export const socketManager = new SocketManager();
