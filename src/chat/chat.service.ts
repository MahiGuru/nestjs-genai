/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BedrockService, BedrockMessage } from '../bedrock/bedrock.service';
import { MessageDto } from './dto/message.dto';

export interface ChatContext {
  userId: string;
  messages: BedrockMessage[];
  lastActivity: Date;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly useBedrockService: boolean;
  private readonly conversationContexts = new Map<string, ChatContext>();
  private readonly maxContextMessages: number = 10; // Keep last 10 messages for context

  constructor(
    private readonly bedrockService: BedrockService,
    private readonly configService: ConfigService,
  ) {
    // Allow fallback to mock responses if Bedrock is not available
    this.useBedrockService =
      this.configService.get<string>('NODE_ENV') !== 'development' ||
      this.configService.get<boolean>('USE_BEDROCK', true);
  }

  async processMessage(messageDto: MessageDto): Promise<string> {
    this.logger.log(`Processing message from user: ${messageDto.userId}`);

    try {
      if (this.useBedrockService) {
        return await this.processWithBedrock(messageDto);
      } else {
        this.logger.warn('Using mock responses - Bedrock disabled');
        return await this.processMockResponse(messageDto);
      }
    } catch (error) {
      this.logger.error(
        `Error processing message: ${error.message}`,
        error.stack,
      );

      // Fallback to mock response if Bedrock fails
      this.logger.warn('Falling back to mock response due to error');
      return await this.processMockResponse(messageDto);
    }
  }

  private async processWithBedrock(messageDto: MessageDto): Promise<string> {
    // Get or create conversation context
    const context = this.getOrCreateContext(messageDto.userId);

    // Add user message to context
    context.messages.push({
      role: 'user',
      content: messageDto.content,
    });

    // Maintain context window
    this.maintainContextWindow(context);

    // Prepare system prompt for better responses
    const messagesWithSystem = this.addSystemPrompt(context.messages);

    // Call Bedrock service
    const response =
      await this.bedrockService.generateResponse(messagesWithSystem);

    // Add assistant response to context
    context.messages.push({
      role: 'assistant',
      content: response.content,
    });

    context.lastActivity = new Date();

    this.logger.log(
      `Generated response with ${response.usage?.outputTokens || 0} tokens`,
    );

    return response.content;
  }

  async processMessageStream(
    messageDto: MessageDto,
    onChunk: (chunk: string) => void,
  ): Promise<void> {
    this.logger.log(
      `Processing streaming message from user: ${messageDto.userId}`,
    );

    try {
      if (!this.useBedrockService) {
        // For mock responses, simulate streaming
        const mockResponse = await this.processMockResponse(messageDto);
        await this.simulateStreaming(mockResponse, onChunk);
        return;
      }

      const context = this.getOrCreateContext(messageDto.userId);

      context.messages.push({
        role: 'user',
        content: messageDto.content,
      });

      this.maintainContextWindow(context);
      const messagesWithSystem = this.addSystemPrompt(context.messages);

      let accumulatedResponse = '';

      await this.bedrockService.generateStreamResponse(
        messagesWithSystem,
        (chunk) => {
          if (!chunk.isComplete) {
            accumulatedResponse += chunk.content;
            onChunk(chunk.content);
          } else {
            // Add complete response to context
            context.messages.push({
              role: 'assistant',
              content: accumulatedResponse,
            });
            context.lastActivity = new Date();
          }
        },
      );
    } catch (error) {
      this.logger.error(`Error in streaming: ${error.message}`, error.stack);

      // Fallback to regular response
      const fallbackResponse = await this.processMockResponse(messageDto);
      await this.simulateStreaming(fallbackResponse, onChunk);
    }
  }

  private getOrCreateContext(userId: string): ChatContext {
    if (!this.conversationContexts.has(userId)) {
      this.conversationContexts.set(userId, {
        userId,
        messages: [],
        lastActivity: new Date(),
      });
    }
    return this.conversationContexts.get(userId)!;
  }

  private maintainContextWindow(context: ChatContext): void {
    // Keep only the last maxContextMessages, but always keep system message if present
    if (context.messages.length > this.maxContextMessages) {
      const systemMessages = context.messages.filter(
        (msg) => msg.role === 'system',
      );
      const recentMessages = context.messages
        .filter((msg) => msg.role !== 'system')
        .slice(-this.maxContextMessages);

      context.messages = [...systemMessages, ...recentMessages];
    }
  }

  /**
   * ADD SYSTEM PROMPT
   * @param messages
   * @returns
   */

  private addSystemPrompt(messages: BedrockMessage[]): BedrockMessage[] {
    const systemPrompt = `You are a helpful AI assistant in a chat application. You should:

1. Provide clear, concise, and helpful responses
2. Use markdown formatting when appropriate (headings, code blocks, lists, etc.)
3. Be conversational but professional
4. Offer code examples when discussing technical topics
5. Structure your responses with proper headings for better readability
6. Be encouraging and supportive in your tone

Format your responses to be visually appealing with proper markdown structure including:
- Use ## for main headings
- Use ### for sub-headings  
- Use **bold** for emphasis
- Use \`code\` for inline code
- Use \`\`\`language blocks for code examples
- Use bullet points for lists

Remember you're in a chat interface similar to Claude AI, so maintain that level of quality and helpfulness.`;

    // Check if system message already exists
    const hasSystemMessage = messages.some((msg) => msg.role === 'system');

    if (!hasSystemMessage) {
      return [{ role: 'system' as const, content: systemPrompt }, ...messages];
    }

    return messages;
  }

  private async simulateStreaming(
    text: string,
    onChunk: (chunk: string) => void,
  ): Promise<void> {
    const words = text.split(' ');
    const chunkSize = 3; // Send 3 words at a time

    for (let i = 0; i < words.length; i += chunkSize) {
      const chunk =
        words.slice(i, i + chunkSize).join(' ') +
        (i + chunkSize < words.length ? ' ' : '');

      onChunk(chunk);

      // Small delay to simulate real streaming
      await new Promise((resolve) =>
        setTimeout(resolve, 50 + Math.random() * 100),
      );
    }
  }

  // Keep the original mock response logic as fallback
  private async processMockResponse(messageDto: MessageDto): Promise<string> {
    // Simulate processing time
    await this.delay(800 + Math.random() * 1500);

    const content = messageDto.content.toLowerCase();

    // Route to appropriate response type based on content
    if (
      this.containsKeywords(content, [
        'code',
        'programming',
        'function',
        'class',
        'typescript',
        'javascript',
        'python',
        'java',
        'c++',
        'c#',
        'go',
        'rust',
      ])
    ) {
      return this.generateCodeResponse(messageDto.content);
    } else if (
      this.containsKeywords(content, [
        'explain',
        'how',
        'what',
        'why',
        'understand',
        'tutorial',
        'learn',
      ])
    ) {
      return this.generateExplanationResponse(messageDto.content);
    } else if (
      this.containsKeywords(content, [
        'analyze',
        'analysis',
        'compare',
        'evaluate',
        'assessment',
        'review',
      ])
    ) {
      return this.generateAnalysisResponse(messageDto.content);
    } else {
      return this.generateGeneralResponse(messageDto.content);
    }
  }

  private containsKeywords(text: string, keywords: string[]): boolean {
    return keywords.some((keyword) => text.includes(keyword));
  }

  private generateCodeResponse(input: string): string {
    return `## Code Solution

Here's a clean implementation based on your request:

\`\`\`typescript
// Example TypeScript solution
class ResponseHandler {
  constructor(private readonly input: string) {}

  process(): string {
    return this.input
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  async processAsync(): Promise<string> {
    // Simulate async processing
    await new Promise(resolve => setTimeout(resolve, 100));
    return this.process();
  }
}

const handler = new ResponseHandler("${input}");
console.log(await handler.processAsync());
\`\`\`

### Key Features

**🎯 Type Safety**: Full TypeScript support with proper typing
**🏗️ Clean Architecture**: Follows SOLID principles
**⚡ Performance**: Optimized with async/await patterns
**🛡️ Error Handling**: Comprehensive error handling

This solution follows 2025 best practices and is production-ready.`;
  }

  private generateExplanationResponse(input: string): string {
    return `## Understanding Your Question

Let me break down the concept you're asking about:

### Core Principles

The fundamental idea revolves around understanding how modern applications handle data flow and user interactions in real-time environments.

### How It Works

**1. Input Processing**
- System receives and validates user input using strict type checking
- Data is sanitized and transformed according to business rules
- Validation layers ensure data integrity throughout the pipeline

**2. Real-time Communication**
- WebSocket connections enable bidirectional communication
- Event-driven architecture ensures responsive user experiences
- Message queuing handles high-throughput scenarios

**3. Response Generation**
- AI-powered processing analyzes user intent
- Context-aware responses are generated based on conversation history
- Markdown formatting provides rich, readable output

### Best Practices for 2025

- Use TypeScript for type safety and better developer experience
- Implement proper error boundaries and graceful degradation
- Follow microservices architecture for scalability
- Use container orchestration for deployment

This approach ensures both scalability and maintainability while providing excellent user experiences.`;
  }

  private generateAnalysisResponse(input: string): string {
    return `## Comprehensive Analysis

### Executive Summary

Based on your input: **"${input}"**, here's a detailed analysis considering current technology trends and best practices.

### Key Findings

**Strengths Identified:**
- Clear communication of requirements and objectives
- Focus on practical implementation over theoretical concepts
- Alignment with modern development practices

**Areas for Optimization:**
- Implementation could benefit from modern architectural patterns
- Performance considerations should be prioritized early
- Scalability planning needs to be incorporated from the start

### Technical Recommendations

**Architecture & Design:**
1. **Microservices Approach**: Break down functionality into discrete services
2. **Event-Driven Architecture**: Use event sourcing for better data consistency
3. **API-First Design**: Ensure all components communicate through well-defined APIs
4. **Container Orchestration**: Use Docker and Kubernetes for deployment

### Implementation Roadmap

**Phase 1** (Weeks 1-2): Core infrastructure and basic functionality
**Phase 2** (Weeks 3-4): User interface development and testing
**Phase 3** (Weeks 5-6): Advanced features and optimization
**Phase 4** (Weeks 7-8): Security hardening and deployment

This analysis provides a strategic foundation for making informed decisions.`;
  }

  private generateGeneralResponse(input: string): string {
    return `## Response to Your Message

Thank you for your message: **"${input}"**

### How I Can Help

I'm designed to assist with a wide range of topics including:

**Development & Technical:**
- Code reviews and optimization suggestions
- Architecture design and best practices
- Debugging and troubleshooting assistance
- Technology stack recommendations

**Analysis & Research:**
- Data analysis and interpretation
- Market research and competitive analysis
- Process optimization recommendations
- Strategic planning assistance

### Next Steps

To provide you with the most helpful response, feel free to:
1. Ask specific technical questions
2. Request code examples or explanations
3. Share context about your project or challenges

I'm here to help make your project successful and efficient!`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Utility methods for conversation management
  clearUserContext(userId: string): void {
    this.conversationContexts.delete(userId);
    this.logger.log(`Cleared context for user: ${userId}`);
  }

  getUserContextInfo(userId: string): {
    messageCount: number;
    lastActivity: Date | null;
  } {
    const context = this.conversationContexts.get(userId);
    return {
      messageCount: context?.messages.length || 0,
      lastActivity: context?.lastActivity || null,
    };
  }

  // Clean up old contexts (should be called periodically)
  cleanupOldContexts(maxAgeHours: number = 24): void {
    const cutoffTime = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);

    for (const [userId, context] of this.conversationContexts.entries()) {
      if (context.lastActivity < cutoffTime) {
        this.conversationContexts.delete(userId);
        this.logger.log(`Cleaned up old context for user: ${userId}`);
      }
    }
  }
}
