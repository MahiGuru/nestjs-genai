import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class MessageDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(5000, {
    message: 'Message content cannot exceed 5000 characters'
  })
  content: string;

  @IsNotEmpty()
  @IsString()
  userId: string;
}

export interface ChatResponse {
  content: string;
  timestamp: string;
  type: 'assistant' | 'user';
  messageId?: string;
}

export interface TypingStatus {
  isTyping: boolean;
  userId: string;
}