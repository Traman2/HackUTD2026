import { ChatBedrockConverse } from "@langchain/aws";

export type BedrockClientOptions = NonNullable<
  ConstructorParameters<typeof ChatBedrockConverse>[0]
>;

// Server-side only. Credentials come from the AWS SDK's default provider chain
export function createBedrockClient(
  options: BedrockClientOptions = {},
): ChatBedrockConverse {
  return new ChatBedrockConverse({
    model: process.env.BEDROCK_MODEL_ID || "amazon.nova-lite-v1:0",
    region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1",
    maxTokens: 4096,
    maxRetries: 2,
    ...options,
  });
}
