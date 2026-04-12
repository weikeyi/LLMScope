import type { ProviderPlugin } from '@llmscope/core';
import type {
  CanonicalMessage,
  CanonicalPart,
  CanonicalTool,
  CanonicalUsage,
} from '@llmscope/shared-types';

const GENERIC_WARNING =
  'Generic OpenAI-compatible normalization applied; provider-specific behavior may differ.';

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const pathWithoutQuery = (path: string): string => {
  return path.split('?')[0] ?? path;
};

const pathMatchesSuffix = (path: string, suffix: string): boolean => {
  const normalized = pathWithoutQuery(path).toLowerCase();
  return normalized === suffix || normalized.endsWith(suffix);
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

const toTextParts = (value: unknown): CanonicalPart[] => {
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

    if (
      (part.type === 'text' ||
        part.type === 'input_text' ||
        part.type === 'output_text') &&
      typeof part.text === 'string'
    ) {
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
    parts: toTextParts(value.content),
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

  if (value.input_schema !== undefined) {
    tool.inputSchema = value.input_schema;
  }

  return tool;
};

const toOpenAiUsage = (value: unknown): CanonicalUsage | undefined => {
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

  if (typeof value.reasoning_tokens === 'number') {
    usage.reasoningTokens = value.reasoning_tokens;
  }

  if (
    isRecord(value.output_tokens_details) &&
    typeof value.output_tokens_details.reasoning_tokens === 'number'
  ) {
    usage.reasoningTokens = value.output_tokens_details.reasoning_tokens;
  }

  if (typeof value.total_tokens === 'number') {
    usage.totalTokens = value.total_tokens;
  }

  return Object.keys(usage).length === 0 ? undefined : usage;
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

const toParsedStreamEvent = (
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

  return warnings === undefined
    ? { event: canonicalEvent }
    : { event: canonicalEvent, warnings };
};

const toRequestExchange = (body: Record<string, unknown>) => {
  const exchange: {
    provider: 'openai-compatible';
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
    provider: 'openai-compatible',
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
    exchange.inputMessages = body.messages.map((message) =>
      toCanonicalMessage(message),
    );
  }

  if (Array.isArray(body.tools)) {
    exchange.tools = body.tools.map((tool) => toCanonicalTool(tool));
  }

  if (body.tool_choice !== undefined) {
    exchange.toolChoice = body.tool_choice;
  }

  return exchange;
};

const toRequestMatch = (
  apiStyle: 'chat.completions' | 'responses',
  requestPath: string,
  requestBody: unknown,
) => {
  let confidence = 0.55;
  const reasons = [`matched generic ${apiStyle} path ${requestPath}`];

  if (isRecord(requestBody) && typeof requestBody.model === 'string') {
    confidence += 0.1;
    reasons.push('found model field');
  }

  if (
    apiStyle === 'chat.completions' &&
    isRecord(requestBody) &&
    Array.isArray(requestBody.messages)
  ) {
    confidence += 0.1;
    reasons.push('found messages array');
  }

  if (
    apiStyle === 'responses' &&
    isRecord(requestBody) &&
    requestBody.input !== undefined
  ) {
    confidence += 0.1;
    reasons.push('found input field');
  }

  return {
    provider: 'openai-compatible' as const,
    apiStyle,
    confidence,
    reasons,
  };
};

const toInstructionMessages = (
  value: unknown,
): CanonicalMessage[] | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  return [
    {
      role: 'system',
      parts: [{ type: 'text', text: value }],
      raw: value,
    },
  ];
};

const toInputMessage = (value: unknown): CanonicalMessage => {
  if (!isRecord(value)) {
    return {
      role: 'user',
      parts: toTextParts(value),
      raw: value,
    };
  }

  if (value.type === 'message') {
    return toCanonicalMessage({
      type: value.type,
      role: value.role,
      content: value.content,
    });
  }

  return {
    role: 'user',
    parts: [{ type: 'unknown', value }],
    raw: value,
  };
};

const toInputMessages = (input: unknown): CanonicalMessage[] | undefined => {
  if (input === undefined) {
    return undefined;
  }

  if (typeof input === 'string') {
    return [
      {
        role: 'user',
        parts: [{ type: 'text', text: input }],
        raw: input,
      },
    ];
  }

  if (Array.isArray(input)) {
    return input.map((item) => toInputMessage(item));
  }

  return [toInputMessage(input)];
};

const toOutputMessage = (
  item: Record<string, unknown>,
): CanonicalMessage | undefined => {
  if (item.type !== 'message') {
    return undefined;
  }

  return {
    role: item.role === 'assistant' ? 'assistant' : 'unknown',
    parts: toTextParts(item.content),
    raw: item,
  };
};

const toOutputMessages = (output: unknown): CanonicalMessage[] | undefined => {
  if (!Array.isArray(output)) {
    return undefined;
  }

  const messages = output
    .filter(isRecord)
    .map((item) => toOutputMessage(item))
    .filter((item) => item !== undefined);

  return messages.length > 0 ? messages : undefined;
};

const toOutputText = (
  output: CanonicalMessage[] | undefined,
): string | undefined => {
  if (output === undefined) {
    return undefined;
  }

  const text = output
    .flatMap((message) => message.parts)
    .filter(
      (part): part is Extract<CanonicalPart, { type: 'text' }> =>
        part.type === 'text',
    )
    .map((part) => part.text)
    .join('');

  return text.length > 0 ? text : undefined;
};

const toResponseUsage = (value: unknown): CanonicalUsage | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const usage = toOpenAiUsage({
    prompt_tokens: value.input_tokens,
    completion_tokens: value.output_tokens,
    total_tokens: value.total_tokens,
    output_tokens_details: value.output_tokens_details,
  });

  if (usage !== undefined) {
    return usage;
  }

  if (
    typeof value.input_tokens === 'number' &&
    typeof value.output_tokens === 'number'
  ) {
    return {
      inputTokens: value.input_tokens,
      outputTokens: value.output_tokens,
      totalTokens:
        typeof value.total_tokens === 'number'
          ? value.total_tokens
          : value.input_tokens + value.output_tokens,
    };
  }

  return undefined;
};

export const genericOpenAiChatCompletionsPlugin: ProviderPlugin = {
  id: 'generic-openai-chat-completions',
  displayName: 'Generic OpenAI-compatible Chat Completions',
  match(ctx) {
    if (ctx.request.method !== 'POST') {
      return null;
    }

    if (!pathMatchesSuffix(ctx.request.path, '/chat/completions')) {
      return null;
    }

    return toRequestMatch(
      'chat.completions',
      pathWithoutQuery(ctx.request.path),
      ctx.requestBody,
    );
  },
  parseRequest(ctx) {
    const body = ctx.rawRequest.bodyJson;

    if (!isRecord(body)) {
      return {
        warnings: [
          GENERIC_WARNING,
          'Expected JSON object request body for OpenAI-compatible chat completions.',
        ],
      };
    }

    return {
      exchange: toRequestExchange(body),
      warnings: [GENERIC_WARNING],
    };
  },
  parseResponse(ctx) {
    const body = ctx.rawResponse.bodyJson;

    if (!isRecord(body)) {
      return {
        warnings: [
          'Expected JSON object response body for OpenAI-compatible chat completions.',
        ],
      };
    }

    const choices = Array.isArray(body.choices)
      ? body.choices.filter(isRecord)
      : [];
    const firstChoice = choices[0];
    const message = isRecord(firstChoice?.message) ? firstChoice.message : undefined;
    const finishReason =
      typeof firstChoice?.finish_reason === 'string'
        ? firstChoice.finish_reason
        : undefined;
    const usage = toOpenAiUsage(body.usage);
    const exchange: {
      provider: 'openai-compatible';
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
      provider: 'openai-compatible',
      apiStyle: 'chat.completions',
    };

    if (typeof body.model === 'string') {
      exchange.model = body.model;
    }

    if (message !== undefined) {
      exchange.output = {
        raw: body,
        messages: [
          {
            role: 'assistant',
            parts: toTextParts(message.content),
            raw: message,
          },
        ],
      };

      if (typeof message.content === 'string') {
        exchange.output.text = message.content;
      }

      if (finishReason !== undefined) {
        exchange.output.finishReason = finishReason;
      }
    }

    if (usage !== undefined) {
      exchange.usage = usage;
    }

    return { exchange };
  },
  parseStreamEvent(ctx) {
    if (ctx.rawLine === '[DONE]') {
      return toParsedStreamEvent({
        ...createStreamEventBase(ctx, 'message_stop'),
        normalized: { done: true },
      });
    }

    if (!isRecord(ctx.rawJson)) {
      return null;
    }

    const choices = Array.isArray(ctx.rawJson.choices)
      ? ctx.rawJson.choices.filter(isRecord)
      : [];
    const firstChoice = choices[0];
    const delta = isRecord(firstChoice?.delta) ? firstChoice.delta : undefined;

    if (typeof delta?.content === 'string') {
      return toParsedStreamEvent({
        ...createStreamEventBase(ctx, 'delta'),
        rawJson: ctx.rawJson,
        normalized: {
          text: delta.content,
        },
      });
    }

    return toParsedStreamEvent(
      {
        ...createStreamEventBase(ctx, 'unknown'),
        rawJson: ctx.rawJson,
      },
      ['Unhandled OpenAI-compatible chat completions SSE event shape.'],
    );
  },
};

export const genericOpenAiResponsesPlugin: ProviderPlugin = {
  id: 'generic-openai-responses',
  displayName: 'Generic OpenAI-compatible Responses',
  match(ctx) {
    if (ctx.request.method !== 'POST') {
      return null;
    }

    if (!pathMatchesSuffix(ctx.request.path, '/responses')) {
      return null;
    }

    return toRequestMatch(
      'responses',
      pathWithoutQuery(ctx.request.path),
      ctx.requestBody,
    );
  },
  parseRequest(ctx) {
    const body = ctx.rawRequest.bodyJson;

    if (!isRecord(body)) {
      return {
        warnings: [
          GENERIC_WARNING,
          'Expected JSON object request body for OpenAI-compatible responses.',
        ],
      };
    }

    const exchange: {
      provider: 'openai-compatible';
      apiStyle: 'responses';
      model?: string;
      stream?: boolean;
      temperature?: number;
      topP?: number;
      maxTokens?: number;
      instructions?: CanonicalMessage[];
      inputMessages?: CanonicalMessage[];
      tools?: CanonicalTool[];
      toolChoice?: unknown;
      responseFormat?: unknown;
    } = {
      provider: 'openai-compatible',
      apiStyle: 'responses',
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

    if (typeof body.max_output_tokens === 'number') {
      exchange.maxTokens = body.max_output_tokens;
    }

    const instructions = toInstructionMessages(body.instructions);
    if (instructions !== undefined) {
      exchange.instructions = instructions;
    }

    const inputMessages = toInputMessages(body.input);
    if (inputMessages !== undefined) {
      exchange.inputMessages = inputMessages;
    }

    if (Array.isArray(body.tools)) {
      exchange.tools = body.tools.map((tool) => toCanonicalTool(tool));
    }

    if (body.tool_choice !== undefined) {
      exchange.toolChoice = body.tool_choice;
    }

    if (body.response_format !== undefined) {
      exchange.responseFormat = body.response_format;
    }

    if (body.text !== undefined) {
      exchange.responseFormat = body.text;
    }

    return {
      exchange,
      warnings: [GENERIC_WARNING],
    };
  },
  parseResponse(ctx) {
    const body = ctx.rawResponse.bodyJson;

    if (!isRecord(body)) {
      return {
        warnings: [
          'Expected JSON object response body for OpenAI-compatible responses.',
        ],
      };
    }

    const messages = toOutputMessages(body.output);
    const text = toOutputText(messages);
    const usage = toResponseUsage(body.usage);
    const exchange: {
      provider: 'openai-compatible';
      apiStyle: 'responses';
      model?: string;
      output?: {
        text?: string;
        messages?: CanonicalMessage[];
        finishReason?: string;
        raw: Record<string, unknown>;
      };
      usage?: CanonicalUsage;
    } = {
      provider: 'openai-compatible',
      apiStyle: 'responses',
    };

    if (typeof body.model === 'string') {
      exchange.model = body.model;
    }

    if (messages !== undefined || typeof body.status === 'string') {
      exchange.output = {
        raw: body,
      };

      if (messages !== undefined) {
        exchange.output.messages = messages;
      }

      if (text !== undefined) {
        exchange.output.text = text;
      }

      if (typeof body.status === 'string') {
        exchange.output.finishReason = body.status;
      }
    }

    if (usage !== undefined) {
      exchange.usage = usage;
    }

    return { exchange };
  },
  parseStreamEvent(ctx) {
    if (ctx.rawLine === '[DONE]') {
      return toParsedStreamEvent({
        ...createStreamEventBase(ctx, 'message_stop'),
        normalized: { done: true },
      });
    }

    if (!isRecord(ctx.rawJson)) {
      return toParsedStreamEvent(createStreamEventBase(ctx, 'unknown'), [
        'Unhandled OpenAI-compatible responses SSE event shape.',
      ]);
    }

    if (ctx.rawJson.type === 'response.created') {
      const normalized: { status?: string } = {};
      if (
        isRecord(ctx.rawJson.response) &&
        typeof ctx.rawJson.response.status === 'string'
      ) {
        normalized.status = ctx.rawJson.response.status;
      }

      return toParsedStreamEvent({
        ...createStreamEventBase(ctx, 'message_start'),
        rawJson: ctx.rawJson,
        ...(Object.keys(normalized).length > 0 ? { normalized } : {}),
      } as Parameters<typeof toParsedStreamEvent>[0]);
    }

    if (
      ctx.rawJson.type === 'response.output_text.delta' &&
      typeof ctx.rawJson.delta === 'string'
    ) {
      return toParsedStreamEvent({
        ...createStreamEventBase(ctx, 'delta'),
        rawJson: ctx.rawJson,
        normalized: { text: ctx.rawJson.delta },
      });
    }

    if (
      ctx.rawJson.type === 'response.output_item.added' &&
      isRecord(ctx.rawJson.item) &&
      ctx.rawJson.item.type === 'function_call'
    ) {
      const normalized: { id?: string; name?: string; arguments?: string } = {};

      if (typeof ctx.rawJson.item.call_id === 'string') {
        normalized.id = ctx.rawJson.item.call_id;
      }

      if (typeof ctx.rawJson.item.name === 'string') {
        normalized.name = ctx.rawJson.item.name;
      }

      if (typeof ctx.rawJson.item.arguments === 'string') {
        normalized.arguments = ctx.rawJson.item.arguments;
      }

      return toParsedStreamEvent({
        ...createStreamEventBase(ctx, 'tool_call_start'),
        rawJson: ctx.rawJson,
        ...(Object.keys(normalized).length > 0 ? { normalized } : {}),
      } as Parameters<typeof toParsedStreamEvent>[0]);
    }

    if (
      ctx.rawJson.type === 'response.function_call_arguments.delta' &&
      typeof ctx.rawJson.delta === 'string'
    ) {
      return toParsedStreamEvent({
        ...createStreamEventBase(ctx, 'tool_call_delta'),
        rawJson: ctx.rawJson,
        normalized: { arguments: ctx.rawJson.delta },
      } as Parameters<typeof toParsedStreamEvent>[0]);
    }

    if (ctx.rawJson.type === 'response.completed') {
      const normalized: { done: true; status?: string } = { done: true };
      if (
        isRecord(ctx.rawJson.response) &&
        typeof ctx.rawJson.response.status === 'string'
      ) {
        normalized.status = ctx.rawJson.response.status;
      }

      return toParsedStreamEvent({
        ...createStreamEventBase(ctx, 'message_stop'),
        rawJson: ctx.rawJson,
        normalized,
      });
    }

    if (ctx.rawJson.type === 'response.error') {
      return toParsedStreamEvent({
        ...createStreamEventBase(ctx, 'error'),
        rawJson: ctx.rawJson,
        normalized: isRecord(ctx.rawJson.error)
          ? ctx.rawJson.error
          : ctx.rawJson,
      } as Parameters<typeof toParsedStreamEvent>[0]);
    }

    if (ctx.rawJson.type === 'response.usage' && isRecord(ctx.rawJson.usage)) {
      const usage = toResponseUsage(ctx.rawJson.usage);
      if (usage !== undefined) {
        return toParsedStreamEvent({
          ...createStreamEventBase(ctx, 'usage'),
          rawJson: ctx.rawJson,
          normalized: usage,
        } as Parameters<typeof toParsedStreamEvent>[0]);
      }
    }

    return toParsedStreamEvent(
      {
        ...createStreamEventBase(ctx, 'unknown'),
        rawJson: ctx.rawJson,
      },
      ['Unhandled OpenAI-compatible responses SSE event shape.'],
    );
  },
};
