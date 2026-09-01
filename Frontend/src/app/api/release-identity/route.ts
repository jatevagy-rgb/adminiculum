import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    commitSha: process.env.NEXT_PUBLIC_APP_COMMIT_SHA || null,
    buildTime: process.env.NEXT_PUBLIC_APP_BUILD_TIME || null,
  });
}
