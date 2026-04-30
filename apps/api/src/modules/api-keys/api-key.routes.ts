import { Router } from "express";
import { z } from "zod";
import { API_KEY_ENVIRONMENTS, PAYMENT_PROVIDERS } from "@securepay/shared";

import { ApiKeyRepository } from "./api-key.repository.js";
import { encryptSecret } from "../../security/encryption.js";
import { getOrganizationContext, requireOrganizationContext } from "../../middleware/tenant-context.js";
import { authenticateJwt } from "../../middleware/authenticate-jwt.js";
import { attachSubscriptionAccess, requireActiveSubscription } from "../../middleware/entitlements.js";

const createApiKeySchema = z.object({
  provider: z.enum(PAYMENT_PROVIDERS),
  label: z.string().min(1).max(120),
  key: z.string().min(16),
  environment: z.enum(API_KEY_ENVIRONMENTS).default("test"),
});

export const apiKeyRouter = Router();
const repository = new ApiKeyRepository();

apiKeyRouter.get("/", authenticateJwt, requireOrganizationContext, async (req, res, next) => {
  try {
    const { organizationId } = getOrganizationContext(req);
    const apiKeys = await repository.listByOrganization(organizationId);
    res.json({
      data: apiKeys.map((key) => ({
        id: key.id,
        provider: key.provider,
        label: key.label,
        environment: key.environment,
        keyPreview: key.key_preview,
        createdAt: key.created_at,
      })),
    });
  } catch (error) {
    next(error);
  }
});

apiKeyRouter.post(
  "/",
  authenticateJwt,
  requireOrganizationContext,
  attachSubscriptionAccess,
  requireActiveSubscription,
  async (req, res, next) => {
    try {
      const { organizationId } = getOrganizationContext(req);
      const body = createApiKeySchema.parse(req.body);
      const encrypted = encryptSecret(body.key);
      const keyPreview = body.key.slice(0, 4).padEnd(8, "*");

      const apiKey = await repository.create({
        organizationId,
        provider: body.provider,
        label: body.label,
        environment: body.environment,
        encryptedKey: encrypted.ciphertext,
        encryptionIv: encrypted.iv,
        encryptionTag: encrypted.authTag,
        encryptionKeyVersion: encrypted.keyVersion,
        keyPreview,
      });

      res.status(201).json({
        data: {
          id: apiKey.id,
          provider: apiKey.provider,
          label: apiKey.label,
          environment: apiKey.environment,
          keyPreview: apiKey.key_preview,
          createdAt: apiKey.created_at,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);
