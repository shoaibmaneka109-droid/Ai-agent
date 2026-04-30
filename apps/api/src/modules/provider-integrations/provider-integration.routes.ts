import { Router } from "express";
import { z } from "zod";
import { API_KEY_ENVIRONMENTS, PAYMENT_PROVIDERS } from "@securepay/shared";

import { requireAdmin } from "../../middleware/admin-only.js";
import { authenticateJwt } from "../../middleware/authenticate-jwt.js";
import { attachSubscriptionAccess, requireActiveSubscription } from "../../middleware/entitlements.js";
import { getOrganizationContext, requireOrganizationContext } from "../../middleware/tenant-context.js";
import { decryptSecret, encryptSecret, type EncryptedSecret } from "../../security/encryption.js";
import { testProviderConnection } from "./provider-connection-tester.js";
import {
  ProviderIntegrationRepository,
  type ProviderIntegrationRecord
} from "./provider-integration.repository.js";

const saveIntegrationSchema = z.object({
  provider: z.enum(PAYMENT_PROVIDERS),
  environment: z.enum(API_KEY_ENVIRONMENTS).default("test"),
  apiKey: z.string().min(8),
  webhookSecret: z.string().min(8).optional(),
  cardIssuingEnabled: z.boolean().default(true)
});

const repository = new ProviderIntegrationRepository();

export const providerIntegrationRouter = Router();

providerIntegrationRouter.get(
  "/",
  authenticateJwt,
  requireOrganizationContext,
  requireAdmin,
  async (req, res, next) => {
    try {
      const { organizationId } = getOrganizationContext(req);
      const integrations = await repository.listByOrganization(organizationId);
      res.json({ data: integrations.map(toSummary) });
    } catch (error) {
      next(error);
    }
  }
);

providerIntegrationRouter.put(
  "/",
  authenticateJwt,
  requireOrganizationContext,
  requireAdmin,
  attachSubscriptionAccess,
  requireActiveSubscription,
  async (req, res, next) => {
    try {
      const { organizationId } = getOrganizationContext(req);
      const body = saveIntegrationSchema.parse(req.body);
      const apiKey = encryptSecret(body.apiKey);
      const webhookSecret = body.webhookSecret ? encryptSecret(body.webhookSecret) : undefined;

      const integration = await repository.upsert({
        organizationId,
        provider: body.provider,
        environment: body.environment,
        label: `${body.provider} ${body.environment}`,
        apiKey,
        webhookSecret,
        apiKeyPreview: previewSecret(body.apiKey),
        webhookSecretPreview: body.webhookSecret ? previewSecret(body.webhookSecret) : undefined,
        cardIssuingEnabled: body.cardIssuingEnabled
      });

      res.json({ data: toSummary(integration) });
    } catch (error) {
      next(error);
    }
  }
);

providerIntegrationRouter.post(
  "/:integrationId/test",
  authenticateJwt,
  requireOrganizationContext,
  requireAdmin,
  attachSubscriptionAccess,
  requireActiveSubscription,
  async (req, res, next) => {
    try {
      const { organizationId } = getOrganizationContext(req);
      const integration = await repository.findById(organizationId, req.params.integrationId);

      if (!integration) {
        res.status(404).json({
          error: {
            code: "PROVIDER_INTEGRATION_NOT_FOUND",
            message: "Save provider credentials before running a connection test."
          }
        });
        return;
      }

      const result = await testProviderConnection(
        integration.provider,
        integration.environment,
        decryptSecret(toEncryptedSecret(integration, "api"))
      );

      const status = result.ok ? "success" : "failed";
      await repository.recordConnectionTest({
        id: integration.id,
        status,
        message: result.message
      });

      res.json({
        data: {
          provider: integration.provider,
          environment: integration.environment,
          status,
          message: result.message,
          checkedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

const previewSecret = (secret: string): string =>
  secret.length <= 8 ? secret.padEnd(8, "*") : `${secret.slice(0, 4)}...${secret.slice(-4)}`;

const toEncryptedSecret = (
  integration: ProviderIntegrationRecord,
  kind: "api" | "webhook"
): EncryptedSecret => ({
  algorithm: "aes-256-gcm",
  ciphertext:
    kind === "api" ? integration.encrypted_api_key : integration.encrypted_webhook_secret ?? "",
  iv: kind === "api" ? integration.api_key_iv : integration.webhook_secret_iv ?? "",
  authTag: kind === "api" ? integration.api_key_tag : integration.webhook_secret_tag ?? "",
  keyVersion: integration.encryption_key_version
});

const toSummary = (integration: ProviderIntegrationRecord) => ({
  id: integration.id,
  provider: integration.provider,
  environment: integration.environment,
  label: integration.label,
  apiKeyPreview: integration.key_preview,
  webhookSecretPreview: integration.webhook_secret_preview,
  cardIssuingEnabled: integration.card_issuing_enabled,
  lastConnectionStatus: integration.last_test_status ?? "untested",
  lastConnectionMessage: integration.last_test_message,
  lastConnectionCheckedAt: integration.last_tested_at?.toISOString() ?? null,
  updatedAt: integration.updated_at.toISOString()
});
