import type { NextRequest } from "next/server";

import { notificationReadAllRoute } from "@/lib/notification-routes";

export async function POST(request: NextRequest) {
  return notificationReadAllRoute(request);
}
