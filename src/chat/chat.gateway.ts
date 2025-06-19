import {
    WebSocketGateway,
    SubscribeMessage,
    MessageBody,
    ConnectedSocket,
    OnGatewayConnection,
    OnGatewayDisconnect,
    WebSocketServer,
  } from '@nestjs/websockets';
  import { Server, Socket } from 'socket.io';
  import { Logger, UsePipes, ValidationPipe } from '@nestjs/common';
  import { ChatService } from './chat.service';
  import { MessageDto, ChatResponse } from './dto/message.dto';
  
  @WebSocketGateway({
    cors: {
      origin: "*",
      credentials: true
    },
    transports: ['websocket', 'polling']
  })
  export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;
  
    private readonly logger = new Logger(ChatGateway.name);
    private connectedClients = new Map<string, { socket: Socket; userId?: string }>();
  
    constructor(private readonly chatService: ChatService) {}
  
    handleConnection(client: Socket) {
      this.logger.log(`Client connected: ${client.id}`);
      this.connectedClients.set(client.id, { socket: client });
      
      // Send connection confirmation
      client.emit('connection-status', {
        status: 'connected',
        message: 'Successfully connected to chat server',
        timestamp: new Date().toISOString()
      });
    }
  
    handleDisconnect(client: Socket) {
      this.logger.log(`Client disconnected: ${client.id}`);
      this.connectedClients.delete(client.id);
    }
  
    @SubscribeMessage('message')
    @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
    async handleMessage(
      @MessageBody() messageDto: MessageDto,
      @ConnectedSocket() client: Socket,
    ) {
      try {
        this.logger.log(`Processing message from ${messageDto.userId}: ${messageDto.content.substring(0, 50)}...`);
        
        // Update client info with userId
        const clientInfo = this.connectedClients.get(client.id);
        if (clientInfo) {
          clientInfo.userId = messageDto.userId;
        }
  
        // Send typing indicator
        client.emit('typing', { isTyping: true, userId: messageDto.userId });
        
        // Process the message through the chat service
        const response = await this.chatService.processMessage(messageDto);
        
        // Stop typing indicator
        client.emit('typing', { isTyping: false, userId: messageDto.userId });
        
        // Send the response
        const chatResponse: ChatResponse = {
          content: response,
          timestamp: new Date().toISOString(),
          type: 'assistant',
          messageId: this.generateMessageId()
        };
  
        client.emit('response', chatResponse);
        
        this.logger.log(`Response sent to ${messageDto.userId}`);
        
      } catch (error) {
        this.logger.error(`Error processing message: ${error.message}`, error.stack);
        
        // Stop typing indicator on error
        client.emit('typing', { isTyping: false, userId: messageDto.userId });
        
        // Send error response
        client.emit('error', {
          message: 'Sorry, I encountered an error processing your message. Please try again.',
          timestamp: new Date().toISOString(),
          type: 'error'
        });
      }
    }
  
    @SubscribeMessage('ping')
    handlePing(@ConnectedSocket() client: Socket) {
      client.emit('pong', {
        timestamp: new Date().toISOString(),
        serverTime: Date.now()
      });
    }
  
    @SubscribeMessage('join-room')
    handleJoinRoom(
      @MessageBody() data: { roomId: string; userId: string },
      @ConnectedSocket() client: Socket,
    ) {
      client.join(data.roomId);
      this.logger.log(`User ${data.userId} joined room ${data.roomId}`);
      
      client.emit('room-joined', {
        roomId: data.roomId,
        message: `Successfully joined room ${data.roomId}`,
        timestamp: new Date().toISOString()
      });
    }
  
    @SubscribeMessage('leave-room')
    handleLeaveRoom(
      @MessageBody() data: { roomId: string; userId: string },
      @ConnectedSocket() client: Socket,
    ) {
      client.leave(data.roomId);
      this.logger.log(`User ${data.userId} left room ${data.roomId}`);
      
      client.emit('room-left', {
        roomId: data.roomId,
        message: `Left room ${data.roomId}`,
        timestamp: new Date().toISOString()
      });
    }
  
    // Utility method to broadcast to all connected clients
    broadcastToAll(event: string, data: any) {
      this.server.emit(event, data);
    }
  
    // Utility method to send message to specific user
    sendToUser(userId: string, event: string, data: any) {
      for (const [socketId, clientInfo] of this.connectedClients.entries()) {
        if (clientInfo.userId === userId) {
          clientInfo.socket.emit(event, data);
          break;
        }
      }
    }
  
    // Get connected clients count
    getConnectedClientsCount(): number {
      return this.connectedClients.size;
    }
  
    private generateMessageId(): string {
      return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
  }