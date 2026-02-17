import {
  createEVMAccount,
  createSolanaKeypairFromKey,
} from "@web3-agent/core";
import {
  getUser,
  createUser,
  getMessages,
  addMessage,
  clearMessages,
} from "../models/users.js";
import type { UserRecord } from "../models/users.js";
import { logger } from "../logger.js";

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

const MAX_HISTORY_MESSAGES = 50;
const MAX_HISTORY_CHARS = 30_000;

export interface UserSession {
  telegramUserId: number;
  evmAccount: ReturnType<typeof createEVMAccount>;
  solanaKeypair: ReturnType<typeof createSolanaKeypairFromKey>;
  evmAddress: string;
  solanaAddress: string;
  conversationHistory: ConversationMessage[];
  pendingApprovals: Map<
    string,
    { resolve: (approved: boolean) => void; timeout: NodeJS.Timeout }
  >;
}

const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export class UserSessionManager {
  private sessions = new Map<number, UserSession>();
  private encryptionKey: string;

  constructor(encryptionKey: string) {
    this.encryptionKey = encryptionKey;
  }

  async getOrCreateSession(telegramUserId: number): Promise<UserSession> {
    const cached = this.sessions.get(telegramUserId);
    if (cached) return cached;

    let userRecord: UserRecord | null = await getUser(
      telegramUserId,
      this.encryptionKey
    );
    if (!userRecord) {
      userRecord = await createUser(telegramUserId, this.encryptionKey);
      logger.info(
        { telegramUserId, evmAddress: userRecord.evmAddress },
        "Created new wallet for Telegram user"
      );
    }

    const evmAccount = createEVMAccount(userRecord.evmPrivateKey);
    const solanaKeypair = createSolanaKeypairFromKey(userRecord.solanaPrivateKey);

    const savedMessages = await getMessages(telegramUserId, MAX_HISTORY_MESSAGES);
    const conversationHistory: ConversationMessage[] = savedMessages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    logger.info(
      { telegramUserId, restoredMessages: conversationHistory.length },
      "Restored conversation history from DB"
    );

    const session: UserSession = {
      telegramUserId,
      evmAccount,
      solanaKeypair,
      evmAddress: userRecord.evmAddress,
      solanaAddress: userRecord.solanaAddress,
      conversationHistory,
      pendingApprovals: new Map(),
    };

    this.sessions.set(telegramUserId, session);
    return session;
  }

  async addToHistory(
    telegramUserId: number,
    message: ConversationMessage
  ): Promise<void> {
    const session = this.sessions.get(telegramUserId);
    if (!session) return;

    session.conversationHistory.push(message);
    await addMessage(telegramUserId, message.role, message.content);

    // Trim by message count
    while (session.conversationHistory.length > MAX_HISTORY_MESSAGES) {
      session.conversationHistory.shift();
    }

    // Trim by total character count
    let totalChars = session.conversationHistory.reduce(
      (sum, m) => sum + m.content.length,
      0
    );
    while (totalChars > MAX_HISTORY_CHARS && session.conversationHistory.length > 2) {
      const removed = session.conversationHistory.shift()!;
      totalChars -= removed.content.length;
    }
  }

  async clearHistory(telegramUserId: number): Promise<void> {
    const session = this.sessions.get(telegramUserId);
    if (session) session.conversationHistory = [];
    await clearMessages(telegramUserId);
  }

  requestApproval(
    telegramUserId: number,
    toolUseId: string
  ): Promise<boolean> {
    const session = this.sessions.get(telegramUserId);
    if (!session) return Promise.resolve(false);

    return new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => {
        session.pendingApprovals.delete(toolUseId);
        resolve(false);
      }, APPROVAL_TIMEOUT_MS);

      session.pendingApprovals.set(toolUseId, { resolve, timeout });
    });
  }

  resolveApproval(
    telegramUserId: number,
    toolUseId: string,
    approved: boolean
  ): boolean {
    const session = this.sessions.get(telegramUserId);
    if (!session) return false;

    const pending = session.pendingApprovals.get(toolUseId);
    if (!pending) return false;

    clearTimeout(pending.timeout);
    session.pendingApprovals.delete(toolUseId);
    pending.resolve(approved);
    return true;
  }
}
