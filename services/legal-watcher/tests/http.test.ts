/**
 * T06-T09 — bounded HTTP layer: timeout, bounded retry, fail-closed, size cap.
 * No live CELLAR: the transport function is faked.
 */
import {
  boundedHttpPost,
  HttpError,
  ResponseTooLargeError,
  type HttpPostFn,
  type HttpStreamResponse,
} from '../src/http';
import { jsonResponse } from './helpers';

const baseOptions = {
  timeoutMs: 1000,
  retries: 2,
  backoffMs: 500,
  backoffFactor: 2,
  maxBytes: 1024 * 1024,
  deadlineMs: 30000,
};

function textResponse(text: string, status = 200): HttpStreamResponse {
  return jsonResponse(text, status);
}

describe('bounded HTTP', () => {
  test('T06 timeout fails closed with a TIMEOUT-class error', async () => {
    const post: HttpPostFn = (_url, _body, signal) =>
      new Promise<HttpStreamResponse>((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    await expect(
      boundedHttpPost({ ...baseOptions, timeoutMs: 50, retries: 0 }, post, 'http://u', 'q'),
    ).rejects.toMatchObject({
      code: 'RETRY_EXHAUSTED',
      message: expect.stringMatching(/TIMEOUT/),
    });
  });

  test('T07 HTTP 429 retries then succeeds (bounded attempts)', async () => {
    let calls = 0;
    const post: HttpPostFn = async () => {
      calls++;
      if (calls < 2) return textResponse('busy', 429);
      return textResponse('ok', 200);
    };
    const sleeps: number[] = [];
    const result = await boundedHttpPost(
      baseOptions,
      post,
      'http://u',
      'q',
      (ms) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
    );
    expect(result.status).toBe(200);
    expect(result.text).toBe('ok');
    expect(calls).toBe(2);
    expect(sleeps).toEqual([500]);
  });

  test('T08 retry exhaustion after the hard maximum', async () => {
    let calls = 0;
    const post: HttpPostFn = async () => {
      calls++;
      return textResponse('busy', 429);
    };
    await expect(
      boundedHttpPost(baseOptions, post, 'http://u', 'q', () => Promise.resolve()),
    ).rejects.toMatchObject({ code: 'RETRY_EXHAUSTED', statusCode: 429 });
    expect(calls).toBe(3);
  });

  test('T09 5xx (non-retryable) fails closed without retry', async () => {
    let calls = 0;
    const post: HttpPostFn = async () => {
      calls++;
      return textResponse('boom', 500);
    };
    await expect(boundedHttpPost(baseOptions, post, 'http://u', 'q')).rejects.toMatchObject({
      code: 'HTTP_STATUS',
      statusCode: 500,
    });
    expect(calls).toBe(1);
  });

  test('bounded response size fails closed (content-length pre-check)', async () => {
    const post: HttpPostFn = async () => ({
      status: 200,
      contentLength: 10 * 1024 * 1024,
      async readText(maxBytes) {
        if (10 * 1024 * 1024 > maxBytes) {
          throw new ResponseTooLargeError(`response content-length 10485760 exceeds ${maxBytes} bytes`);
        }
        return 'x';
      },
    });
    await expect(
      boundedHttpPost({ ...baseOptions, maxBytes: 1024 }, post, 'http://u', 'q'),
    ).rejects.toMatchObject({ code: 'RESPONSE_TOO_LARGE' });
  });

  test('network failure is retried then fails closed', async () => {
    let calls = 0;
    const post: HttpPostFn = async () => {
      calls++;
      throw new TypeError('fetch failed');
    };
    const err = await boundedHttpPost(
      baseOptions,
      post,
      'http://u',
      'q',
      () => Promise.resolve(),
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err).toMatchObject({ code: 'RETRY_EXHAUSTED' });
    expect(calls).toBe(3);
  });
});
