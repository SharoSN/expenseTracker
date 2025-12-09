// backend/rateLimiter.js
import { Query } from "node-appwrite";

const PLAN_LIMITS = {
  basic: {
    name: "Basic",
    dailyAIAllowance: 50,
    description: "50 AI interactions per day",
  },
  pro: {
    name: "Pro",
    dailyAIAllowance: 500,
    description: "500 AI interactions per day",
  },
};

export class RateLimiter {
  constructor(database, dbId, rateLimitCollectionId) {
    this.database = database;
    this.dbId = dbId;
    this.rateLimitCollectionId = rateLimitCollectionId;
  }

  // Get user's subscription plan
  async getUserPlan(userId) {
    try {
      const docs = await this.database.listDocuments(this.dbId, this.rateLimitCollectionId, [
        Query.equal("userId", userId),
      ]);

      if (docs.documents.length === 0) return "basic";
      return docs.documents[0].plan || "basic";
    } catch (error) {
      console.error("Error getting user plan:", error);
      return "basic"; // Default to basic if error
    }
  }

  // Get today's AI usage count
  async getTodayUsage(userId) {
    try {
      const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
      const docs = await this.database.listDocuments(this.dbId, this.rateLimitCollectionId, [
        Query.equal("userId", userId),
      ]);

      if (docs.documents.length === 0) return 0;

      const record = docs.documents[0];
      const lastUsageDate = record.lastUsageDate;

      // Reset if different day
      if (lastUsageDate !== today) {
        return 0;
      }

      return record.aiUsageCount || 0;
    } catch (error) {
      console.error("Error getting usage:", error);
      return 0;
    }
  }

  // Check if user can make AI request
  async canMakeAIRequest(userId) {
    const plan = await this.getUserPlan(userId);
    const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.basic;
    const usage = await this.getTodayUsage(userId);

    const allowed = usage < limits.dailyAIAllowance;
    const remaining = limits.dailyAIAllowance - usage;

    return { allowed, remaining, limit: limits.dailyAIAllowance };
  }

  // Increment AI usage after successful request
  async incrementAIUsage(userId) {
    try {
      const today = new Date().toISOString().split("T")[0];
      const docs = await this.database.listDocuments(this.dbId, this.rateLimitCollectionId, [
        Query.equal("userId", userId),
      ]);

      if (docs.documents.length === 0) {
        // Create new record
        await this.database.createDocument(this.dbId, this.rateLimitCollectionId, userId, {
          userId,
          plan: "basic",
          aiUsageCount: 1,
          lastUsageDate: today,
        });
      } else {
        const record = docs.documents[0];
        const lastDate = record.lastUsageDate;

        // Reset if new day
        if (lastDate !== today) {
          await this.database.updateDocument(this.dbId, this.rateLimitCollectionId, record.$id, {
            aiUsageCount: 1,
            lastUsageDate: today,
          });
        } else {
          // Increment existing count
          await this.database.updateDocument(this.dbId, this.rateLimitCollectionId, record.$id, {
            aiUsageCount: record.aiUsageCount + 1,
          });
        }
      }
    } catch (error) {
      console.error("Error incrementing usage:", error);
    }
  }

  // Get user's remaining allowance
  async getRemainingAllowance(userId) {
    try {
      // Check if user has a record, if not create one
      const docs = await this.database.listDocuments(this.dbId, this.rateLimitCollectionId, [
        Query.equal("userId", userId),
      ]);


      if (docs.documents.length === 0) {
        // Create new record for this user
        const today = new Date().toISOString().split("T")[0];

        try {
          const newDoc = await this.database.createDocument(
            this.dbId,
            this.rateLimitCollectionId,
            userId,
            {
              userId,
              plan: "basic",
              aiUsageCount: 0,
              lastUsageDate: today,
            }
          );
          console.log(`✅ Successfully created rate limit record:`, newDoc);
        } catch (createError) {
          console.error(`❌ Error creating document:`, createError.message);
          throw createError;
        }
      }
    } catch (error) {
      console.error("❌ Error in getRemainingAllowance:", error);
    }

    const plan = await this.getUserPlan(userId);
    const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.basic;
    const usage = await this.getTodayUsage(userId);

    // Calculate next reset time (tomorrow at midnight)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);


    return {
      remaining: limits.dailyAIAllowance - usage,
      limit: limits.dailyAIAllowance,
      resetTime: tomorrow.toISOString(),
    };
  }

  // Update user's subscription plan
  async updateUserPlan(userId, newPlan) {
    // ✅ Validate plan is either 'basic' or 'pro'
    if (!["basic", "pro"].includes(newPlan)) {
      throw new Error(`Invalid plan: ${newPlan}. Must be 'basic' or 'pro'`);
    }

    try {
      const docs = await this.database.listDocuments(this.dbId, this.rateLimitCollectionId, [
        Query.equal("userId", userId),
      ]);

      if (docs.documents.length === 0) {
        await this.database.createDocument(this.dbId, this.rateLimitCollectionId, userId, {
          userId,
          plan: newPlan,
          aiUsageCount: 0,
          lastUsageDate: new Date().toISOString().split("T")[0],
        });
      } else {
        await this.database.updateDocument(this.dbId, this.rateLimitCollectionId, docs.documents[0].$id, {
          plan: newPlan,
        });
      }
      console.log(`✅ Updated ${userId} to ${newPlan} plan`);
    } catch (error) {
      console.error("Error updating plan:", error);
    }
  }
}
