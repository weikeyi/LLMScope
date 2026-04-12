import { createHash } from 'node:crypto';
import type { IncomingMessage, Server } from 'node:http';
import { URL } from 'node:url';

import type { WsEvent } from '@llmscope/shared-types';

interface WritableSocket {
  destroy(): void;
  end(): void;
  on(event: 'close' | 'error', listener: () => void): void;
  write(chunk: string | Uint8Array): void;
}

const toWebSocketAccept = (key: string): string => {
  return createHash('sha1')
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest('base64');
};

const encodeTextFrame = (payload: string): Uint8Array => {
  const body = Buffer.from(payload, 'utf8');

  if (body.byteLength < 126) {
    return Buffer.concat([Buffer.from([0x81, body.byteLength]), body]);
  }

  if (body.byteLength < 65_536) {
    const header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(body.byteLength, 2);
    return Buffer.concat([header, body]);
  }

  const header = Buffer.alloc(10);
  header[0] = 0x81;
  header[1] = 127;
  header.writeBigUInt64BE(BigInt(body.byteLength), 2);
  return Buffer.concat([header, body]);
};

export interface ObservationWsHub {
  attach(server: Server): void;
  broadcast(event: WsEvent): void;
  close(): void;
}

export const createObservationWsHub = (): ObservationWsHub => {
  const sockets = new Set<WritableSocket>();

  const removeSocket = (socket: WritableSocket): void => {
    sockets.delete(socket);
  };

  return {
    attach(server: Server): void {
      server.on('upgrade', (request: IncomingMessage, socket) => {
        const requestUrl = new URL(
          request.url ?? '/',
          `http://${request.headers.host ?? '127.0.0.1'}`,
        );

        if (requestUrl.pathname !== '/ws') {
          socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
          socket.destroy();
          return;
        }

        const upgrade = request.headers.upgrade?.toLowerCase();
        const key = request.headers['sec-websocket-key'];

        if (upgrade !== 'websocket' || typeof key !== 'string') {
          socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
          socket.destroy();
          return;
        }

        socket.write(
          [
            'HTTP/1.1 101 Switching Protocols',
            'Upgrade: websocket',
            'Connection: Upgrade',
            `Sec-WebSocket-Accept: ${toWebSocketAccept(key)}`,
            '\r\n',
          ].join('\r\n'),
        );

        const writableSocket = socket as unknown as WritableSocket;
        sockets.add(writableSocket);
        writableSocket.on('close', () => {
          removeSocket(writableSocket);
        });
        writableSocket.on('error', () => {
          removeSocket(writableSocket);
        });
      });
    },
    broadcast(event: WsEvent): void {
      const frame = encodeTextFrame(JSON.stringify(event));

      for (const socket of sockets) {
        try {
          socket.write(frame);
        } catch {
          removeSocket(socket);
          socket.destroy();
        }
      }
    },
    close(): void {
      for (const socket of sockets) {
        socket.end();
        socket.destroy();
      }

      sockets.clear();
    },
  };
};
