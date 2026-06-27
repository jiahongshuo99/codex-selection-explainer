const DEFAULT_MAX_MESSAGE_BYTES = 1024 * 1024;

export function encodeMessage(message) {
  const payload = Buffer.from(JSON.stringify(message), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(payload.length, 0);
  return Buffer.concat([header, payload]);
}

export function decodeMessages(buffer, options = {}) {
  const maxMessageBytes = options.maxMessageBytes ?? DEFAULT_MAX_MESSAGE_BYTES;
  const messages = [];
  let offset = 0;

  while (offset < buffer.length) {
    if (buffer.length - offset < 4) {
      throw new Error("Incomplete native message header");
    }

    const length = buffer.readUInt32LE(offset);
    offset += 4;

    if (length > maxMessageBytes) {
      throw new Error(`Native message is too large: ${length} bytes`);
    }

    if (buffer.length - offset < length) {
      throw new Error("Incomplete native message payload");
    }

    const payload = buffer.subarray(offset, offset + length).toString("utf8");
    offset += length;
    messages.push(JSON.parse(payload));
  }

  return messages;
}

export class NativeMessageParser {
  #buffer = Buffer.alloc(0);
  #maxMessageBytes;

  constructor(options = {}) {
    this.#maxMessageBytes = options.maxMessageBytes ?? DEFAULT_MAX_MESSAGE_BYTES;
  }

  push(chunk) {
    this.#buffer = Buffer.concat([this.#buffer, chunk]);
    const messages = [];

    while (this.#buffer.length >= 4) {
      const length = this.#buffer.readUInt32LE(0);

      if (length > this.#maxMessageBytes) {
        throw new Error(`Native message is too large: ${length} bytes`);
      }

      if (this.#buffer.length < 4 + length) {
        break;
      }

      const payload = this.#buffer.subarray(4, 4 + length).toString("utf8");
      this.#buffer = this.#buffer.subarray(4 + length);
      messages.push(JSON.parse(payload));
    }

    return messages;
  }
}
