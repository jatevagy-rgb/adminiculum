import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';

test('SHOWROOM_GATE: page.tsx is a Server Component with fail-closed production check', () => {
  const pagePath = path.resolve('src/app/dev/showroom/page.tsx');
  const source = fs.readFileSync(pagePath, 'utf8');

  // Must NOT be a client component
  assert.ok(!source.includes('\"use client\"'), 'page.tsx must be a Server Component (no \"use client\")');
  assert.ok(!source.includes('\'use client\''), 'page.tsx must be a Server Component (no \'use client\')');

  // Must import notFound from next/navigation
  assert.ok(source.includes('notFound'), 'page.tsx must import notFound');

  // Must reference ADMINICULUM_ENABLE_UI_SHOWROOM on the server
  assert.ok(source.includes('ADMINICULUM_ENABLE_UI_SHOWROOM'), 'page.tsx must check ADMINICULUM_ENABLE_UI_SHOWROOM');

  // Must NOT delegate authority to a NEXT_PUBLIC variable
  assert.ok(!source.includes('NEXT_PUBLIC_'), 'page.tsx must not use NEXT_PUBLIC variables for security gate');
});

test('SHOWROOM_GATE: ShowroomClient has no client-side authority logic', () => {
  const clientPath = path.resolve('src/app/dev/showroom/ShowroomClient.tsx');
  const clientSource = fs.readFileSync(clientPath, 'utf8');

  // ShowroomClient is a client component
  assert.ok(clientSource.includes('use client'), 'ShowroomClient.tsx must be a client component');

  // Must NOT check NEXT_PUBLIC environment variables to decide access
  assert.ok(!clientSource.includes('NEXT_PUBLIC_DISABLE_SHOWROOM'), 'ShowroomClient must not check NEXT_PUBLIC_DISABLE_SHOWROOM');
  assert.ok(!clientSource.includes('NEXT_PUBLIC_ENABLE_SHOWROOM'), 'ShowroomClient must not check NEXT_PUBLIC_ENABLE_SHOWROOM');
});

test('SHOWROOM_GATE: ShowroomPage execution enforces server-side fail-closed policy', async () => {
  const { default: ShowroomPage } = await import('../src/app/dev/showroom/page');

  const env = process.env as Record<string, string | undefined>;
  const origNodeEnv = process.env.NODE_ENV;
  const origEnable = process.env.ADMINICULUM_ENABLE_UI_SHOWROOM;

  try {
    // 1. Production without explicit enable flag MUST fail-closed (throw NEXT_NOT_FOUND)
    env.NODE_ENV = 'production';
    delete process.env.ADMINICULUM_ENABLE_UI_SHOWROOM;
    assert.throws(
      () => ShowroomPage(),
      (err: any) =>
        err?.digest?.includes('NEXT_') ||
        err?.digest?.includes('404') ||
        err?.message?.includes('NEXT_') ||
        err?.message?.includes('404') ||
        String(err).includes('404'),
      'Production default must call notFound()'
    );

    // 2. Production with explicit enable flag MUST succeed
    env.NODE_ENV = 'production';
    process.env.ADMINICULUM_ENABLE_UI_SHOWROOM = 'true';
    assert.doesNotThrow(
      () => ShowroomPage(),
      'Production with ADMINICULUM_ENABLE_UI_SHOWROOM=true must allow access'
    );

    // 3. Development environment MUST succeed by default
    env.NODE_ENV = 'development';
    delete process.env.ADMINICULUM_ENABLE_UI_SHOWROOM;
    assert.doesNotThrow(
      () => ShowroomPage(),
      'Development environment must allow access by default'
    );

    // 4. Test environment MUST succeed by default
    env.NODE_ENV = 'test';
    delete process.env.ADMINICULUM_ENABLE_UI_SHOWROOM;
    assert.doesNotThrow(
      () => ShowroomPage(),
      'Test environment must allow access by default'
    );
  } finally {
    env.NODE_ENV = origNodeEnv;
    if (origEnable !== undefined) {
      process.env.ADMINICULUM_ENABLE_UI_SHOWROOM = origEnable;
    } else {
      delete process.env.ADMINICULUM_ENABLE_UI_SHOWROOM;
    }
  }
});
