export interface SseMessage {
  event?: string;
  data: string[];
}

export class SseAccumulator {
  private buffer = '';

  public push(chunk: Buffer | string): SseMessage[] {
    this.buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    const messages: SseMessage[] = [];

    while (true) {
      const separatorIndex = this.buffer.indexOf('\n\n');

      if (separatorIndex === -1) {
        break;
      }

      const frame = this.buffer.slice(0, separatorIndex);
      this.buffer = this.buffer.slice(separatorIndex + 2);
      const message = this.parseFrame(frame);

      if (message !== null) {
        messages.push(message);
      }
    }

    return messages;
  }

  private parseFrame(frame: string): SseMessage | null {
    const normalizedFrame = frame.replaceAll('\r', '');

    if (normalizedFrame.length === 0) {
      return null;
    }

    const message: SseMessage = { data: [] };

    for (const line of normalizedFrame.split('\n')) {
      if (line.startsWith(':')) {
        continue;
      }

      if (line.startsWith('event:')) {
        message.event = line.slice('event:'.length).trim();
        continue;
      }

      if (line.startsWith('data:')) {
        message.data.push(line.slice('data:'.length).trimStart());
      }
    }

    return message.data.length === 0 && message.event === undefined
      ? null
      : message;
  }
}
