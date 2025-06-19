import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BedrockModule } from '../bedrock/bedrock.module';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';

@Module({
  imports: [
    ConfigModule,
    BedrockModule,
  ],
  providers: [ChatGateway, ChatService],
  exports: [ChatService],
})
export class ChatModule {}