/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelWithResponseStreamCommand,
} from '@aws-sdk/client-bedrock-runtime';

export interface BedrockMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface BedrockResponse {
  content: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  finishReason?: string;
}

export interface BedrockStreamChunk {
  content: string;
  isComplete: boolean;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

@Injectable()
export class BedrockService implements OnModuleInit {
  private readonly logger = new Logger(BedrockService.name);
  private bedrockClient: BedrockRuntimeClient;
  private readonly modelId: string;
  private readonly maxTokens: number;
  private readonly temperature: number;
  private readonly topP: number;

  constructor(private configService: ConfigService) {
    this.modelId = this.configService.get<string>(
      'BEDROCK_MODEL_ID',
      'anthropic.claude-3-sonnet-20240229-v1:0',
    );
    this.maxTokens = parseInt(
      this.configService.get<string>('MAX_TOKENS', '4096'),
      10,
    );
    this.temperature = parseFloat(
      this.configService.get<string>('TEMPERATURE', '0.7'),
    );
    this.topP = parseFloat(this.configService.get<string>('TOP_P', '0.9'));
  }

  async onModuleInit() {
    await this.initializeBedrockClient();
  }

  private async initializeBedrockClient() {
    try {
      const region = this.configService.get<string>('AWS_REGION', 'us-east-1');
      const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
      const secretAccessKey = this.configService.get<string>(
        'AWS_SECRET_ACCESS_KEY',
      );

      // Debug logging for credential verification
      this.logger.log(`🔧 Initializing Bedrock client...`);
      this.logger.log(`📍 Region: ${region}`);
      this.logger.log(
        `🔑 Access Key ID: ${accessKeyId ? `${accessKeyId.substring(0, 8)}...` : 'NOT SET'}`,
      );
      this.logger.log(`🔐 Secret Key: ${secretAccessKey ? 'SET' : 'NOT SET'}`);

      if (!accessKeyId || !secretAccessKey) {
        throw new Error(
          'AWS credentials not found. Please check your .env file contains AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY',
        );
      }

      this.bedrockClient = new BedrockRuntimeClient({
        region,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });

      this.logger.log(`✅ Bedrock client initialized for region: ${region}`);
      this.logger.log(`📋 Using model: ${this.modelId}`);

      // Test the connection
      await this.testConnection();
    } catch (error) {
      this.logger.error(
        '❌ Failed to initialize Bedrock client:',
        error.message,
      );
      this.logger.error('💡 Common solutions:');
      this.logger.error('   1. Check your .env file is in the project root');
      this.logger.error(
        '   2. Verify AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are correct',
      );
      this.logger.error(
        '   3. Ensure AWS_REGION is set to us-east-1 or us-west-2',
      );
      this.logger.error(
        '   4. Check IAM user has bedrock:InvokeModel permissions',
      );
      throw error;
    }
  }

  private async testConnection() {
    try {
      const testMessage =
        "Hello! Please respond with just 'Connection successful' to test the API.";
      const response = await this.generateResponse([
        { role: 'user', content: testMessage },
      ]);
      this.logger.log('🧪 Bedrock connection test successful');
      this.logger.log(
        `📝 Test response: ${response.content.substring(0, 100)}...`,
      );
    } catch (error) {
      this.logger.warn('⚠️ Bedrock connection test failed:', error.message);
      // Don't throw here - app should still start even if test fails
    }
  }

  async generateResponse(messages: BedrockMessage[]): Promise<BedrockResponse> {
    try {
      if (this.modelId.includes('anthropic.claude')) {
        return await this.invokeClaudeModel(messages);
      } else if (this.modelId.includes('meta.llama')) {
        return await this.invokeLlamaModel(messages);
      } else if (this.modelId.includes('amazon.titan')) {
        return await this.invokeTitanModel(messages);
      } else {
        throw new Error(`Unsupported model: ${this.modelId}`);
      }
    } catch (error) {
      this.logger.error('Error generating response:', error);
      throw error;
    }
  }

  async generateStreamResponse(
    messages: BedrockMessage[],
    onChunk: (chunk: BedrockStreamChunk) => void,
  ): Promise<void> {
    try {
      if (this.modelId.includes('anthropic.claude')) {
        await this.invokeClaudeModelStream(messages, onChunk);
      } else {
        // Fallback to regular response for models that don't support streaming
        const response = await this.generateResponse(messages);
        onChunk({
          content: response.content,
          isComplete: true,
          usage: response.usage,
        });
      }
    } catch (error) {
      this.logger.error('Error generating stream response:', error);
      throw error;
    }
  }

  private async invokeClaudeModel(
    messages: BedrockMessage[],
  ): Promise<BedrockResponse> {
    // Filter out system messages and format for Claude 3
    const conversationMessages = messages.filter(
      (msg) => msg.role !== 'system',
    );
    const systemMessage = messages.find((msg) => msg.role === 'system');

    const requestBody: any = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: this.maxTokens,
      messages: conversationMessages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
    };

    // Add optional parameters only if they have valid values
    if (this.temperature >= 0 && this.temperature <= 1) {
      requestBody.temperature = this.temperature;
    }

    if (this.topP >= 0 && this.topP <= 1) {
      requestBody.top_p = this.topP;
    }

    // Add system message if present
    if (systemMessage) {
      requestBody.system = systemMessage.content;
    }

    this.logger.debug('Request body:', JSON.stringify(requestBody, null, 2));

    const command = new InvokeModelCommand({
      modelId: this.modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(requestBody),
    });

    const response = await this.bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    return {
      content: responseBody.content[0].text,
      usage: {
        inputTokens: responseBody.usage?.input_tokens || 0,
        outputTokens: responseBody.usage?.output_tokens || 0,
      },
      finishReason: responseBody.stop_reason,
    };
  }

  private async invokeClaudeModelStream(
    messages: BedrockMessage[],
    onChunk: (chunk: BedrockStreamChunk) => void,
  ): Promise<void> {
    // Filter out system messages and format for Claude 3
    const conversationMessages = messages.filter(
      (msg) => msg.role !== 'system',
    );
    const systemMessage = messages.find((msg) => msg.role === 'system');

    const requestBody: any = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: this.maxTokens,
      messages: conversationMessages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
    };

    // Add optional parameters only if they have valid values
    if (this.temperature >= 0 && this.temperature <= 1) {
      requestBody.temperature = this.temperature;
    }

    if (this.topP >= 0 && this.topP <= 1) {
      requestBody.top_p = this.topP;
    }

    // Add system message if present
    if (systemMessage) {
      requestBody.system = systemMessage.content;
    }

    const command = new InvokeModelWithResponseStreamCommand({
      modelId: this.modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(requestBody),
    });

    const response = await this.bedrockClient.send(command);

    if (response.body) {
      let accumulatedContent = '';

      for await (const chunk of response.body) {
        if (chunk.chunk?.bytes) {
          const chunkData = JSON.parse(
            new TextDecoder().decode(chunk.chunk.bytes),
          );

          if (
            chunkData.type === 'content_block_delta' &&
            chunkData.delta?.text
          ) {
            accumulatedContent += chunkData.delta.text;
            onChunk({
              content: chunkData.delta.text,
              isComplete: false,
            });
          } else if (chunkData.type === 'message_stop') {
            onChunk({
              content: '',
              isComplete: true,
              usage: {
                inputTokens: chunkData.usage?.input_tokens || 0,
                outputTokens: chunkData.usage?.output_tokens || 0,
              },
            });
          }
        }
      }
    }
  }

  private async invokeLlamaModel(
    messages: BedrockMessage[],
  ): Promise<BedrockResponse> {
    const prompt = this.formatLlamaPrompt(messages);

    const requestBody = {
      prompt,
      max_gen_len: this.maxTokens,
      temperature: this.temperature,
      top_p: this.topP,
    };

    const command = new InvokeModelCommand({
      modelId: this.modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(requestBody),
    });

    const response = await this.bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    return {
      content: responseBody.generation.trim(),
      usage: {
        inputTokens: responseBody.prompt_token_count || 0,
        outputTokens: responseBody.generation_token_count || 0,
      },
      finishReason: responseBody.stop_reason,
    };
  }

  private async invokeTitanModel(
    messages: BedrockMessage[],
  ): Promise<BedrockResponse> {
    const prompt = this.formatTitanPrompt(messages);

    const requestBody = {
      inputText: prompt,
      textGenerationConfig: {
        maxTokenCount: this.maxTokens,
        temperature: this.temperature,
        topP: this.topP,
        stopSequences: [],
      },
    };

    const command = new InvokeModelCommand({
      modelId: this.modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(requestBody),
    });

    const response = await this.bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    return {
      content: responseBody.results[0].outputText.trim(),
      usage: {
        inputTokens: responseBody.inputTextTokenCount || 0,
        outputTokens: responseBody.results[0].tokenCount || 0,
      },
      finishReason: responseBody.results[0].completionReason,
    };
  }

  private formatClaudePrompt(messages: BedrockMessage[]): string {
    // Claude models use the messages format directly
    return messages.map((msg) => `${msg.role}: ${msg.content}`).join('\n\n');
  }

  private formatLlamaPrompt(messages: BedrockMessage[]): string {
    // Llama uses a specific chat format
    let prompt = '';
    for (const message of messages) {
      if (message.role === 'user') {
        prompt += `[INST] ${message.content} [/INST]`;
      } else {
        prompt += ` ${message.content}`;
      }
    }
    return prompt;
  }

  private formatTitanPrompt(messages: BedrockMessage[]): string {
    // Titan uses a simple conversational format
    return (
      messages
        .map((msg) => {
          if (msg.role === 'user') {
            return `Human: ${msg.content}`;
          } else {
            return `Assistant: ${msg.content}`;
          }
        })
        .join('\n\n') + '\n\nAssistant:'
    );
  }

  // Utility methods
  getModelInfo() {
    return {
      modelId: this.modelId,
      maxTokens: this.maxTokens,
      temperature: this.temperature,
      topP: this.topP,
    };
  }

  async getAvailableModels(): Promise<string[]> {
    // This would typically call ListFoundationModels API
    // For now, return commonly available models
    return [
      'anthropic.claude-3-sonnet-20240229-v1:0',
      'anthropic.claude-3-haiku-20240307-v1:0',
      'anthropic.claude-3-opus-20240229-v1:0',
      'meta.llama2-70b-chat-v1',
      'amazon.titan-text-express-v1',
    ];
  }
}
