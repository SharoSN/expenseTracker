// backend/rateLimiter.js
import { Query, Permission, Role } from "node-appwrite";

// FIX #6: Export PLAN_LIMITS so it can be imported, tested, or extended externally
export const PLAN_LIMITS = {
  basic: {
    name: "Basic",
    dailyAIAllowance: 10,
    description: "10 AI interactions per day"
  },
  pro: {
    name: "Pro",
    dailyAIAllowance: 100,
    description: "100 AI interactions per day"
  }
};

// FIX #4: Use SDK Permission/Role calls to match server.js (was broken string literals)
const createUserPermissions = (userId) => [
  Permission.read(Role.user(userId)),
  Permission.update(Role.user(userId)),
  Permission.delete(Role.user(userId))
];

// Helper: returns today's date as YYYY-MM-DD string
const today = () => new Date().toISOString().split("T")[0];

export class RateLimiter {
  constructor(database, dbId, rateLimitCollectionId) {
    this.database = database;
    this.dbId = dbId;
    this.rateLimitCollectionId = rateLimitCollectionId;
  }

  // FIX #2: Single internal helper — one DB round-trip to get or create the record.
  // All public methods call this instead of each doing their own listDocuments.
  async _getOrCreateRecord(userId) {
    // FIX #7: Validate userId up front for a clean error instead of a confusing Appwrite failure
    if (!userId) throw new Error("userId is required");

    const docs = await this.database.listDocuments(
      this.dbId,
      this.rateLimitCollectionId,
      [Query.equal("userId", userId)]
    );

    if (docs.documents.length > 0) {
      return docs.documents[0];
    }

    // No record yet — create one with sensible defaults
    const newDoc = await this.database.createDocument(
      this.dbId,
      this.rateLimitCollectionId,
      userId, // use userId as document ID for easy direct lookups
      {
        userId,
        plan: "basic",
        aiUsageCount: 0,
        lastUsageDate: today()
      },
      createUserPermissions(userId)
    );

    console.log(`✅ Created rate limit record for user: ${userId}`);
    return newDoc;
  }

  // Derive the effective usage count from a record.
  // If the stored date is not today, the day has rolled over and usage resets to 0.
  _resolveUsage(record) {
    if (record.lastUsageDate !== today()) {
      return 0;
    }
    return record.aiUsageCount || 0;
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  // Check if user can make an AI request.
  // FIX #2: Was 2 separate DB calls (getUserPlan + getTodayUsage). Now 1.
  async canMakeAIRequest(userId) {
    const record = await this._getOrCreateRecord(userId);
    const limits = PLAN_LIMITS[record.plan] || PLAN_LIMITS.basic;
    const usage = this._resolveUsage(record);
    const allowed = usage < limits.dailyAIAllowance;
    // FIX #5: Clamp remaining to 0 so it never goes negative
    const remaining = Math.max(0, limits.dailyAIAllowance - usage);

    return { allowed, remaining, limit: limits.dailyAIAllowance };
  }

  // Increment the AI usage counter after a successful request.
  // FIX #1 note: Appwrite has no atomic increment, so a read→write race is
  // theoretically possible under very high concurrency. For a personal finance
  // app this risk is minimal. If you need true atomicity, move this counter to
  // Redis (INCR) or an Appwrite Function with a mutex.
  // FIX #2: Was 3 separate DB calls. Now 1 read + 1 write.
  async incrementAIUsage(userId) {
    try {
      const record = await this._getOrCreateRecord(userId);
      const currentUsage = this._resolveUsage(record);
      const isNewDay = record.lastUsageDate !== today();

      await this.database.updateDocument(
        this.dbId,
        this.rateLimitCollectionId,
        record.$id,
        {
          // If the day rolled over, reset to 1 (this request). Otherwise increment.
          aiUsageCount: isNewDay ? 1 : currentUsage + 1,
          lastUsageDate: today()
        }
      );
    } catch (error) {
      // Log but don't re-throw — a failed increment should not crash the user's request
      console.error("Error incrementing AI usage:", error);
    }
  }

  // Return remaining allowance info for the current user.
  // FIX #2 + #3: Was multiple DB calls with swallowed errors that caused wrong return values.
  async getRemainingAllowance(userId) {
    // Errors from _getOrCreateRecord will propagate naturally to the caller
    const record = await this._getOrCreateRecord(userId);
    const limits = PLAN_LIMITS[record.plan] || PLAN_LIMITS.basic;
    const usage = this._resolveUsage(record);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    return {
      // FIX #5: Clamp to 0 so client never receives a negative remaining count
      remaining: Math.max(0, limits.dailyAIAllowance - usage),
      limit: limits.dailyAIAllowance,
      resetTime: tomorrow.toISOString()
    };
  }

  // Update a user's subscription plan.
  async updateUserPlan(userId, newPlan) {
    if (!["basic", "pro"].includes(newPlan)) {
      throw new Error(`Invalid plan: ${newPlan}. Must be 'basic' or 'pro'`);
    }

    // FIX #2: Reuse _getOrCreateRecord instead of a fresh listDocuments
    const record = await this._getOrCreateRecord(userId);

    await this.database.updateDocument(
      this.dbId,
      this.rateLimitCollectionId,
      record.$id,
      { plan: newPlan }
    );

    console.log(`✅ Updated user ${userId} to ${newPlan} plan`);
  }

  // Get a user's current plan name (lightweight helper for display purposes).
  async getUserPlan(userId) {
    const record = await this._getOrCreateRecord(userId);
    return record.plan || "basic";
  }
}
