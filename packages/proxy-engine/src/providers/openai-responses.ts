import type { ProviderPlugin } from '@llmscope/core';
import type {
  CanonicalMessage,
  CanonicalPart,
  CanonicalTool,
  CanonicalUsage,
} from '@llmscope/shared-types';

import {
  createStreamEventBase,
  isRecord,
  toCanonicalMessage,
  toCanonicalTool,
  toOpenAiUsage,
  toParsedStreamEvent,
  toTextParts,
} from './openai-chat-completions.js';

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

export const openAiResponsesPlugin: ProviderPlugin = {
  id: 'openai-responses',
  displayName: 'OpenAI Responses',
  match(ctx) {
    if (ctx.request.method !== 'POST') {
      return null;
    }

    const requestPath = ctx.request.path.split('?')[0] ?? ctx.request.path;
    if (requestPath !== '/v1/responses') {
      return null;
    }

    let confidence = 0.8;
    const reasons = ['matched POST /v1/responses'];

    if (
      isRecord(ctx.requestBody) &&
      typeof ctx.requestBody.model === 'string'
    ) {
      confidence += 0.1;
      reasons.push('found model field');
    }

    if (isRecord(ctx.requestBody) && ctx.requestBody.input !== undefined) {
      confidence += 0.1;
      reasons.push('found input field');
    }

    return {
      provider: 'openai',
      apiStyle: 'responses',
      confidence,
      reasons,
    };
  },
  parseRequest(ctx) {
    const body = ctx.rawRequest.bodyJson;

    if (!isRecord(body)) {
      return {
        warnings: ['Expected JSON object request body for OpenAI responses.'],
      };
    }

    const exchange: {
      provider: 'openai';
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
      provider: 'openai',
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

    return { exchange };
  },
  parseResponse(ctx) {
    const body = ctx.rawResponse.bodyJson;

    if (!isRecord(body)) {
      return {
        warnings: ['Expected JSON object response body for OpenAI responses.'],
      };
    }

    const messages = toOutputMessages(body.output);
    const text = toOutputText(messages);
    const usage = toResponseUsage(body.usage);
    const exchange: {
      provider: 'openai';
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
      provider: 'openai',
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
        'Unhandled OpenAI responses SSE event shape.',
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
      ['Unhandled OpenAI responses SSE event shape.'],
    );
  },
};
