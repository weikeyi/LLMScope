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

const toImageUrlPart = (part: Record<string, unknown>): CanonicalPart => {
  const imageUrl = isRecord(part.image_url) ? part.image_url : undefined;

  if (typeof imageUrl?.url === 'string') {
    return {
      type: 'image_url',
      url: imageUrl.url,
    };
  }

  return {
    type: 'image_url',
  };
};

const toTextPart = (value: unknown): CanonicalPart[] => {
  if (typeof value === 'string') {
    return [{ type: 'text', text: value }];
  }

  if (!Array.isArray(value)) {
    return [{ type: 'unknown', value }];
  }

  return value.map((part) => {
    if (!isRecord(part)) {
      return { type: 'unknown', value: part } satisfies CanonicalPart;
    }

    if (part.type === 'text' && typeof part.text === 'string') {
      return { type: 'text', text: part.text } satisfies CanonicalPart;
    }

    if (part.type === 'image_url' && isRecord(part.image_url)) {
      return toImageUrlPart(part);
    }

    return { type: 'unknown', value: part } satisfies CanonicalPart;
  });
};

const toCanonicalMessage = (value: unknown): CanonicalMessage => {
  if (!isRecord(value)) {
    return {
      role: 'unknown',
      parts: [{ type: 'unknown', value }],
      raw: value,
    };
  }

  const role =
    value.role === 'system' ||
    value.role === 'developer' ||
    value.role === 'user' ||
    value.role === 'assistant' ||
    value.role === 'tool'
      ? value.role
      : 'unknown';

  return {
    role,
    parts: toTextPart(value.content),
    raw: value,
  };
};

const toCanonicalTool = (value: unknown): CanonicalTool => {
  if (!isRecord(value)) {
    return { raw: value };
  }

  const functionShape = isRecord(value.function) ? value.function : undefined;
  const tool: CanonicalTool = {
    raw: value,
  };

  if (typeof functionShape?.name === 'string') {
    tool.name = functionShape.name;
  }

  if (typeof functionShape?.description === 'string') {
    tool.description = functionShape.description;
  }

  if (functionShape?.parameters !== undefined) {
    tool.inputSchema = functionShape.parameters;
  }

  return tool;
};

const toToolCallPart = (toolCall: Record<string, unknown>): CanonicalPart => {
  const part: Extract<CanonicalPart, { type: 'tool_call' }> = {
    type: 'tool_call',
  };

  if (typeof toolCall.id === 'string') {
    part.id = toolCall.id;
  }

  if (isRecord(toolCall.function) && typeof toolCall.function.name === 'string') {
    part.name = toolCall.function.name;
  }

  if (isRecord(toolCall.function)) {
    const args = toolCall.function.arguments;

    if (typeof args === 'string' || isRecord(args)) {
      part.arguments = args;
    }
  }

  return part;
};

const collectOutputMessages = (message: Record<string, unknown>): CanonicalMessage[] => {
  const content = Array.isArray(message.content) ? message.content : [];
  const textParts = content
    .filter(isRecord)
    .map((part) => {
      if (part.type === 'text' && typeof part.text === 'string') {
        return { type: 'text', text: part.text } satisfies CanonicalPart;
      }

      return { type: 'unknown', value: part } satisfies CanonicalPart;
    });

  const toolCalls: CanonicalPart[] = Array.isArray(message.tool_calls)
    ? message.tool_calls.filter(isRecord).map((toolCall) => toToolCallPart(toolCall))
    : [];

  const parts = [
    ...toTextPart(typeof message.content === 'string' ? message.content : undefined),
    ...textParts,
    ...toolCalls,
  ];

  return [
    {
      role: 'assistant',
      parts: parts.length > 0 ? parts : [{ type: 'unknown', value: message }],
      raw: message,
    },
  ];
};

const toUsage = (value: unknown): CanonicalUsage | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const usage: CanonicalUsage = {};

  if (typeof value.prompt_tokens === 'number') {
    usage.inputTokens = value.prompt_tokens;
  }

  if (typeof value.completion_tokens === 'number') {
    usage.outputTokens = value.completion_tokens;
  }

  if (typeof value.total_tokens === 'number') {
    usage.totalTokens = value.total_tokens;
  }

  return Object.keys(usage).length === 0 ? undefined : usage;
};

const toRequestExchange = (body: Record<string, unknown>) => {
  const exchange: {
    provider: 'openai';
    apiStyle: 'chat.completions';
    model?: string;
    stream?: boolean;
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    inputMessages?: CanonicalMessage[];
    tools?: CanonicalTool[];
    toolChoice?: unknown;
  } = {
    provider: 'openai',
    apiStyle: 'chat.completions',
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

const toResponseOutput = (
  body: Record<string, unknown>,
  message: Record<string, unknown> | undefined,
  finishReason: string | undefined,
) => {
  if (message === undefined) {
    return undefined;
  }

  const output: {
    text?: string;
    messages: CanonicalMessage[];
    finishReason?: string;
    raw: Record<string, unknown>;
  } = {
    messages: collectOutputMessages(message),
    raw: body,
  };

  if (typeof message.content === 'string') {
    output.text = message.content;
  }

  if (finishReason !== undefined) {
    output.finishReason = finishReason;
  }

  return output;
};

const toResponseExchange = (body: Record<string, unknown>) => {
  const choices = Array.isArray(body.choices) ? body.choices.filter(isRecord) : [];
  const firstChoice = choices[0];
  const message = isRecord(firstChoice?.message) ? firstChoice.message : undefined;
  const finishReason = typeof firstChoice?.finish_reason === 'string' ? firstChoice.finish_reason : undefined;
  const usage = toUsage(body.usage);
  const exchange: {
    provider: 'openai';
    apiStyle: 'chat.completions';
    model?: string;
    output?: {
      text?: string;
      messages: CanonicalMessage[];
      finishReason?: string;
      raw: Record<string, unknown>;
    };
    usage?: CanonicalUsage;
  } = {
    provider: 'openai',
    apiStyle: 'chat.completions',
  };

  if (typeof body.model === 'string') {
    exchange.model = body.model;
  }

  const output = toResponseOutput(body, message, finishReason);
  if (output !== undefined) {
    exchange.output = output;
  }

  if (usage !== undefined) {
    exchange.usage = usage;
  }

  return exchange;
};

const createStreamEventBase = (
  ctx: { eventId: string; sessionId: string; rawLine?: string },
  eventType: 'message_stop' | 'delta' | 'unknown',
) => {
  const event: {
    id: string;
    sessionId: string;
    ts: number;
    eventType: 'message_stop' | 'delta' | 'unknown';
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
    eventType: 'message_stop' | 'delta' | 'unknown';
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
    eventType: 'message_stop' | 'delta' | 'unknown';
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

export const openAiChatCompletionsPlugin: ProviderPlugin = {
  id: 'openai-chat-completions',
  displayName: 'OpenAI Chat Completions',
  match(ctx) {
    if (ctx.request.method !== 'POST') {
      return null;
    }

    const requestPath = ctx.request.path.split('?')[0] ?? ctx.request.path;
    if (requestPath !== '/v1/chat/completions') {
      return null;
    }

    let confidence = 0.8;
    const reasons = ['matched POST /v1/chat/completions'];

    if (isRecord(ctx.requestBody) && typeof ctx.requestBody.model === 'string') {
      confidence += 0.1;
      reasons.push('found model field');
    }

    if (isRecord(ctx.requestBody) && Array.isArray(ctx.requestBody.messages)) {
      confidence += 0.1;
      reasons.push('found messages array');
    }

    return {
      provider: 'openai',
      apiStyle: 'chat.completions',
      confidence,
      reasons,
    };
  },
  parseRequest(ctx) {
    const body = ctx.rawRequest.bodyJson;

    if (!isRecord(body)) {
      return {
        warnings: ['Expected JSON object request body for OpenAI chat completions.'],
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
        warnings: ['Expected JSON object response body for OpenAI chat completions.'],
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

    const choices = Array.isArray(ctx.rawJson.choices) ? ctx.rawJson.choices.filter(isRecord) : [];
    const firstChoice = choices[0];
    const delta = isRecord(firstChoice?.delta) ? firstChoice.delta : undefined;

    if (typeof delta?.content === 'string') {
      return toStreamEvent({
        ...createStreamEventBase(ctx, 'delta'),
        rawJson: ctx.rawJson,
        normalized: {
          text: delta.content,
        },
      });
    }

    return toStreamEvent(
      {
        ...createStreamEventBase(ctx, 'unknown'),
        rawJson: ctx.rawJson,
      },
      ['Unhandled OpenAI chat completions SSE event shape.'],
    );
  },
};
