import "server-only";

import { CatalogService } from "@itqanak/catalog";
import { ContentBlockService } from "@itqanak/content";
import { createLogger } from "@itqanak/observability";
import {
  AdminQuickRepliesService,
  AdminRequestService,
  AssistantHistoryService,
  ChatService,
  GroupChannelService,
  RequestAttachmentService,
  RequestService,
  NotificationService,
  ServiceQuoteService,
  StorageAdminService,
  SupportService,
  UnifiedConversationAttachmentService,
  UnifiedConversationService,
} from "@itqanak/requests";
import { createObjectStorage, type ObjectStorage } from "@itqanak/storage";

import { createAuthRuntime } from "./auth-runtime";

const webProcess = globalThis as typeof globalThis & {
  __itqanakWebObjectStorage?: ObjectStorage;
};

function processObjectStorage(config: Parameters<typeof createObjectStorage>[0]): ObjectStorage {
  // S3Client owns a keep-alive agent and must be shared for the process
  // lifetime. Creating one per request would strand an independent socket
  // pool; destroying it in a route finally block would instead cut an active
  // streamed download after the response has been returned.
  webProcess.__itqanakWebObjectStorage ??= createObjectStorage(config);
  return webProcess.__itqanakWebObjectStorage;
}

export async function createStudentRequestRuntime(requireRateLimiting = false) {
  const runtime = await createAuthRuntime(requireRateLimiting);
  try {
    const logger = createLogger({
      service: runtime.config.serviceName,
      environment: runtime.config.nodeEnv,
      level: runtime.config.logLevel,
    });
    const storage = processObjectStorage(runtime.config.storage);
    const unifiedConversations = new UnifiedConversationService({
      database: runtime.database,
      logger,
      config: runtime.config,
    });
    return {
      ...runtime,
      catalog: new CatalogService({ database: runtime.database }),
      content: new ContentBlockService({ database: runtime.database }),
      requests: new RequestService({
        database: runtime.database,
        config: runtime.config,
        logger,
      }),
      adminRequests: new AdminRequestService({
        database: runtime.database,
        config: runtime.config,
        logger,
      }),
      chat: new ChatService({
        database: runtime.database,
        logger,
      }),
      support: new SupportService({
        database: runtime.database,
        logger,
      }),
      unifiedConversations,
      quotes: new ServiceQuoteService({
        database: runtime.database,
        logger,
        conversations: unifiedConversations,
      }),
      notifications: new NotificationService({ database: runtime.database }),
      assistantHistory: new AssistantHistoryService({ database: runtime.database }),
      adminQuickReplies: new AdminQuickRepliesService({ database: runtime.database }),
      groupChannel: new GroupChannelService({ database: runtime.database }),
      unifiedAttachments: new UnifiedConversationAttachmentService({
        database: runtime.database,
        config: runtime.config,
        storage,
        logger,
      }),
      storageAdmin: new StorageAdminService({ database: runtime.database, storage, logger }),
      attachments: new RequestAttachmentService({
        database: runtime.database,
        config: runtime.config,
        storage,
        logger,
      }),
    };
  } catch (error: unknown) {
    await runtime.close();
    throw error;
  }
}

export type StudentRequestRuntime = Awaited<ReturnType<typeof createStudentRequestRuntime>>;
