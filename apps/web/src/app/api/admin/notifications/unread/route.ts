import type { NextRequest } from "next/server";

import { notificationUnreadRoute } from "@/lib/notification-routes";

export async function GET(request: NextRequest) {
  return notificationUnreadRoute(request);
}
