import type { NextRequest } from "next/server";

import { notificationListRoute } from "@/lib/notification-routes";

export async function GET(request: NextRequest) {
  return notificationListRoute(request);
}
