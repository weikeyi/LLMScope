import type { ProviderPlugin } from '@llmscope/core';
import type {
  CanonicalMessage,
  CanonicalPart,
  CanonicalTool,
  CanonicalUsage,
} from '@llmscope/shared-types';

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const toTextPart = (text: string): CanonicalPart => ({
  type: 'text',
  text,
});

const toUnknownPart = (value: unknown): CanonicalPart => ({
  type: 'unknown',
  value,
});

const toToolCallPart = (block: Record<string, unknown>): CanonicalPart => {
  const part: Extract<CanonicalPart, { type: 'tool_call' }> = {
    type: 'tool_call',
  };

  if (typeof block.id === 'string') {
    part.id = block.id;
  }

  if (typeof block.name === 'string') {
    part.name = block.name;
  }

  if (typeof block.input === 'string' || isRecord(block.input)) {
    part.arguments = block.input;
  }

  return part;
};

const toToolResultPart = (block: Record<string, unknown>): CanonicalPart => {
  const part: Extract<CanonicalPart, { type: 'tool_result' }> = {
    type: 'tool_result',
  };

  if (typeof block.tool_use_id === 'string') {
    part.toolCallId = block.tool_use_id;
  }

  if (typeof block.name === 'string') {
    part.name = block.name;
  }

  if (typeof block.content === 'string') {
    part.content = block.content;
  } else if (Array.isArray(block.content)) {
    const text = block.content
      .filter(isRecord)
      .map((item) => (item.type === 'text' && typeof item.text === 'string' ? item.text : undefined))
      .filter((value): value is string => value !== undefined)
      .join('');

    if (text.length > 0) {
      part.content = text;
    }
  }

  return part;
};

const toImagePart = (block: Record<string, unknown>): CanonicalPart => {
  const source = isRecord(block.source) ? block.source : undefined;

  if (typeof source?.url === 'string') {
    return {
      type: 'image_url',
      url: source.url,
    };
  }

  return toUnknownPart(block);
};

const toCanonicalPart = (value: unknown): CanonicalPart => {
  if (typeof value === 'string') {
    return toTextPart(value);
  }

  if (!isRecord(value)) {
    return toUnknownPart(value);
  }

  if (value.type === 'text' && typeof value.text === 'string') {
    return toTextPart(value.text);
  }

  if (value.type === 'tool_use') {
    return toToolCallPart(value);
  }

  if (value.type === 'tool_result') {
    return toToolResultPart(value);
  }

  if (value.type === 'image') {
    return toImagePart(value);
  }

  return toUnknownPart(value);
};

const toCanonicalMessage = (value: unknown): CanonicalMessage => {
  if (!isRecord(value)) {
    return {
      role: 'unknown',
      parts: [toUnknownPart(value)],
      raw: value,
    };
  }

  const role =
    value.role === 'user' || value.role === 'assistant' ? value.role : value.role === 'system' ? 'system' : 'unknown';

  const rawContent = value.content;
  const parts =
    typeof rawContent === 'string'
      ? [toTextPart(rawContent)]
      : Array.isArray(rawContent)
        ? rawContent.map((part) => toCanonicalPart(part))
        : [toUnknownPart(rawContent)];

  return {
    role,
    parts,
    raw: value,
  };
};

const toInstructionMessages = (value: unknown): CanonicalMessage[] | undefined => {
  if (typeof value === 'string') {
    return [
      {
        role: 'system',
        parts: [toTextPart(value)],
        raw: value,
      },
    ];
  }

  if (Array.isArray(value)) {
    return [
      {
        role: 'system',
        parts: value.map((part) => toCanonicalPart(part)),
        raw: value,
      },
    ];
  }

  return undefined;
};

const toCanonicalTool = (value: unknown): CanonicalTool => {
  if (!isRecord(value)) {
    return { raw: value };
  }

  const tool: CanonicalTool = {
    raw: value,
  };

  if (typeof value.name === 'string') {
    tool.name = value.name;
  }

  if (typeof value.description === 'string') {
    tool.description = value.description;
  }

  if (value.input_schema !== undefined) {
    tool.inputSchema = value.input_schema;
  }

  return tool;
};

const toUsage = (value: unknown): CanonicalUsage | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const usage: CanonicalUsage = {};

  if (typeof value.input_tokens === 'number') {
    usage.inputTokens = value.input_tokens;
  }

  if (typeof value.output_tokens === 'number') {
    usage.outputTokens = value.output_tokens;
  }

  if (typeof value.input_tokens === 'number' && typeof value.output_tokens === 'number') {
    usage.totalTokens = value.input_tokens + value.output_tokens;
  }

  return Object.keys(usage).length > 0 ? usage : undefined;
};

const collectText = (message: CanonicalMessage): string | undefined => {
  const text = message.parts
    .map((part) => (part.type === 'text' ? part.text : undefined))
    .filter((value): value is string => value !== undefined)
    .join('');

  return text.length > 0 ? text : undefined;
};

const toRequestExchange = (body: Record<string, unknown>) => {
  const exchange: {
    provider: 'anthropic';
    apiStyle: 'messages';
    model?: string;
    stream?: boolean;
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    instructions?: CanonicalMessage[];
    inputMessages?: CanonicalMessage[];
    tools?: CanonicalTool[];
    toolChoice?: unknown;
  } = {
    provider: 'anthropic',
    apiStyle: 'messages',
  };

  if (typeof body.model === 'string') {
    exchange.model = body.model;
  }

  if (typeof body.stream === 'boolean') {
    exchange.stream = body.stream;
  }

  if (typeof body.temperature === 'number') {
    exchange.temperature = body.temperature;
  }

  if (typeof body.top_p === 'number') {
    exchange.topP = body.top_p;
  }

  if (typeof body.max_tokens === 'number') {
    exchange.maxTokens = body.max_tokens;
  }

  const instructions = toInstructionMessages(body.system);
  if (instructions !== undefined) {
    exchange.instructions = instructions;
  }

  if (Array.isArray(body.messages)) {
    exchange.inputMessages = body.messages.map((message) => toCanonicalMessage(message));
  }

  if (Array.isArray(body.tools)) {
    exchange.tools = body.tools.map((tool) => toCanonicalTool(tool));
  }

  if (body.tool_choice !== undefined) {
    exchange.toolChoice = body.tool_choice;
  }

  return exchange;
};

const toResponseExchange = (body: Record<string, unknown>) => {
  const exchange: {
    provider: 'anthropic';
    apiStyle: 'messages';
    model?: string;
    output?: {
      text?: string;
      messages: CanonicalMessage[];
      finishReason?: string;
      raw: Record<string, unknown>;
    };
    usage?: CanonicalUsage;
  } = {
    provider: 'anthropic',
    apiStyle: 'messages',
  };

  if (typeof body.model === 'string') {
    exchange.model = body.model;
  }

  const message: CanonicalMessage = {
    role: 'assistant',
    parts: Array.isArray(body.content) ? body.content.map((part) => toCanonicalPart(part)) : [toUnknownPart(body.content)],
    raw: body,
  };

  exchange.output = {
    messages: [message],
    raw: body,
  };

  const text = collectText(message);
  if (text !== undefined) {
    exchange.output.text = text;
  }

  if (typeof body.stop_reason === 'string') {
    exchange.output.finishReason = body.stop_reason;
  }

  const usage = toUsage(body.usage);
  if (usage !== undefined) {
    exchange.usage = usage;
  }

  return exchange;
};

const createStreamEventBase = (
  ctx: { eventId: string; sessionId: string; rawLine?: string },
  eventType:
    | 'message_start'
    | 'delta'
    | 'tool_call_start'
    | 'tool_call_delta'
    | 'message_stop'
    | 'usage'
    | 'error'
    | 'unknown',
) => {
  const event: {
    id: string;
    sessionId: string;
    ts: number;
    eventType:
      | 'message_start'
      | 'delta'
      | 'tool_call_start'
      | 'tool_call_delta'
      | 'message_stop'
      | 'usage'
      | 'error'
      | 'unknown';
    rawLine?: string;
  } = {
    id: ctx.eventId,
    sessionId: ctx.sessionId,
    ts: Date.now(),
    eventType,
  };

  if (ctx.rawLine !== undefined) {
    event.rawLine = ctx.rawLine;
  }

  return event;
};

const toStreamEvent = (
  event: {
    id: string;
    sessionId: string;
    ts: number;
    eventType:
      | 'message_start'
      | 'delta'
      | 'tool_call_start'
      | 'tool_call_delta'
      | 'message_stop'
      | 'usage'
      | 'error'
      | 'unknown';
    rawLine?: string;
    rawJson?: unknown;
    normalized?: unknown;
  },
  warnings?: string[],
) => {
  const canonicalEvent: {
    id: string;
    sessionId: string;
    ts: number;
    eventType:
      | 'message_start'
      | 'delta'
      | 'tool_call_start'
      | 'tool_call_delta'
      | 'message_stop'
      | 'usage'
      | 'error'
      | 'unknown';
    rawLine?: string;
    rawJson?: unknown;
    normalized?: unknown;
  } = {
    id: event.id,
    sessionId: event.sessionId,
    ts: event.ts,
    eventType: event.eventType,
  };

  if (event.rawLine !== undefined) {
    canonicalEvent.rawLine = event.rawLine;
  }

  if (event.rawJson !== undefined) {
    canonicalEvent.rawJson = event.rawJson;
  }

  if (event.normalized !== undefined) {
    canonicalEvent.normalized = event.normalized;
  }

  return warnings === undefined ? { event: canonicalEvent } : { event: canonicalEvent, warnings };
};

export const anthropicMessagesPlugin: ProviderPlugin = {
  id: 'anthropic-messages',
  displayName: 'Anthropic Messages',
  match(ctx) {
    if (ctx.request.method !== 'POST') {
      return null;
    }

    const requestPath = ctx.request.path.split('?')[0] ?? ctx.request.path;
    if (requestPath !== '/v1/messages') {
      return null;
    }

    let confidence = 0.8;
    const reasons = ['matched POST /v1/messages'];

    if (isRecord(ctx.requestBody) && typeof ctx.requestBody.model === 'string') {
      confidence += 0.1;
      reasons.push('found model field');
    }

    if (isRecord(ctx.requestBody) && Array.isArray(ctx.requestBody.messages)) {
      confidence += 0.1;
      reasons.push('found messages array');
    }

    return {
      provider: 'anthropic',
      apiStyle: 'messages',
      confidence,
      reasons,
    };
  },
  parseRequest(ctx) {
    const body = ctx.rawRequest.bodyJson;

    if (!isRecord(body)) {
      return {
        warnings: ['Expected JSON object request body for Anthropic messages.'],
      };
    }

    return {
      exchange: toRequestExchange(body),
    };
  },
  parseResponse(ctx) {
    const body = ctx.rawResponse.bodyJson;

    if (!isRecord(body)) {
      return {
        warnings: ['Expected JSON object response body for Anthropic messages.'],
      };
    }

    return {
      exchange: toResponseExchange(body),
    };
  },
  parseStreamEvent(ctx) {
    if (ctx.rawLine === '[DONE]') {
      return toStreamEvent({
        ...createStreamEventBase(ctx, 'message_stop'),
        normalized: { done: true },
      });
    }

    if (!isRecord(ctx.rawJson)) {
      return null;
    }

    if (ctx.eventName === 'message_start') {
      return toStreamEvent({
        ...createStreamEventBase(ctx, 'message_start'),
        ...(ctx.rawJson !== undefined ? { rawJson: ctx.rawJson } : {}),
      });
    }

    if (ctx.eventName === 'content_block_start' && isRecord(ctx.rawJson.content_block)) {
      const block = ctx.rawJson.content_block;
      if (block.type === 'tool_use') {
        return toStreamEvent({
          ...createStreamEventBase(ctx, 'tool_call_start'),
          rawJson: ctx.rawJson,
          normalized: toToolCallPart(block),
        });
      }
    }

    if (ctx.eventName === 'content_block_delta' && isRecord(ctx.rawJson.delta)) {
      const delta = ctx.rawJson.delta;

      if (delta.type === 'text_delta' && typeof delta.text === 'string') {
        return toStreamEvent({
          ...createStreamEventBase(ctx, 'delta'),
          rawJson: ctx.rawJson,
          normalized: { text: delta.text },
        });
      }

      if (delta.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
        return toStreamEvent({
          ...createStreamEventBase(ctx, 'tool_call_delta'),
          rawJson: ctx.rawJson,
          normalized: { arguments: delta.partial_json },
        });
      }
    }

    if (ctx.eventName === 'message_delta') {
      const usage = toUsage(ctx.rawJson.usage);
      if (usage !== undefined) {
        return toStreamEvent({
          ...createStreamEventBase(ctx, 'usage'),
          rawJson: ctx.rawJson,
          normalized: usage,
        });
      }
    }

    if (ctx.eventName === 'message_stop') {
      return toStreamEvent({
        ...createStreamEventBase(ctx, 'message_stop'),
        ...(ctx.rawJson !== undefined ? { rawJson: ctx.rawJson } : {}),
      });
    }

    if (ctx.eventName === 'error') {
      return toStreamEvent({
        ...createStreamEventBase(ctx, 'error'),
        rawJson: ctx.rawJson,
        normalized: isRecord(ctx.rawJson.error) ? ctx.rawJson.error : ctx.rawJson,
      });
    }

    return toStreamEvent(
      {
        ...createStreamEventBase(ctx, 'unknown'),
        rawJson: ctx.rawJson,
      },
      ['Unhandled Anthropic messages SSE event shape.'],
    );
  },
};
