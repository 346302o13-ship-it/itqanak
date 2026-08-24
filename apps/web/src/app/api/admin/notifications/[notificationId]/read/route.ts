import type { NextRequest } from "next/server";

import { notificationReadRoute } from "@/lib/notification-routes";

interface RouteContext {
  readonly params: Promise<{ readonly notificationId: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  return notificationReadRoute(request, (await context.params).notificationId);
}
