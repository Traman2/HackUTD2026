import { ChatBedrockConverse } from "@langchain/aws";

export const DEFAULT_BEDROCK_MODEL = "nvidia.nemotron-nano-3-30b";
export const bedrockModelId = () => process.env.BEDROCK_MODEL_ID || DEFAULT_BEDROCK_MODEL;

export type BedrockClientOptions = NonNullable<
  ConstructorParameters<typeof ChatBedrockConverse>[0]
>;

// Server-side only. Credentials come from the AWS SDK's default provider chain
export function createBedrockClient(
  options: BedrockClientOptions = {},
): ChatBedrockConverse {
  return new ChatBedrockConverse({
    model: bedrockModelId(),
    region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1",
    maxTokens: 4096,
    maxRetries: 2,
    ...options,
  });
}
