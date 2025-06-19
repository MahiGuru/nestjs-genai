/**
 * Claude-like Chat Application Frontend
 * Modern ES6+ JavaScript with Socket.io integration
 */

class ChatApp {
    constructor() {
        // Socket.io connection
        this.socket = io({
            transports: ['websocket', 'polling'],
            timeout: 20000,
            forceNew: true
        });
        
        // DOM elements
        this.messageInput = document.getElementById('messageInput');
        this.sendButton = document.getElementById('sendButton');
        this.messagesContainer = document.getElementById('messages');
        this.typingIndicator = document.getElementById('typing');
        this.statusIndicator = document.getElementById('status');
        this.statusText = this.statusIndicator.querySelector('.status-text');
        this.loadingOverlay = document.getElementById('loadingOverlay');
        this.errorToast = document.getElementById('errorToast');
        this.errorMessage = document.getElementById('errorMessage');
        this.errorClose = document.getElementById('errorClose');
        this.charCount = document.getElementById('charCount');
        this.clientsCount = document.getElementById('clientsCount');
        this.clientsNumber = document.getElementById('clientsNumber');
        
        // Application state
        this.userId = this.generateUserId();
        this.isConnected = false;
        this.isTyping = false;
        this.messageHistory = [];
        this.currentMessageId = null;
        
        // Initialize application
        this.init();
    }

    /**
     * Initialize the application
     */
    init() {
        this.setupEventListeners();
        this.setupSocketListeners();
        this.updateWelcomeTime();
        this.showLoadingOverlay();
        
        // Auto-focus input when page loads
        setTimeout(() => {
            this.messageInput.focus();
        }, 500);
    }

    /**
     * Generate unique user ID
     */
    generateUserId() {
        return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Setup DOM event listeners
     */
    setupEventListeners() {
        // Send button click
        this.sendButton.addEventListener('click', () => this.sendMessage());
        
        // Input field events
        this.messageInput.addEventListener('keydown', (e) => this.handleInputKeydown(e));
        this.messageInput.addEventListener('input', () => this.handleInputChange());
        this.messageInput.addEventListener('paste', () => {
            // Handle paste event with slight delay to get updated content
            setTimeout(() => this.handleInputChange(), 10);
        });
        
        // Error toast close
        this.errorClose.addEventListener('click', () => this.hideErrorToast());
        
        // Auto-hide error toast after 5 seconds
        let errorTimeout;
        this.errorToast.addEventListener('transitionend', (e) => {
            if (e.target === this.errorToast && this.errorToast.classList.contains('show')) {
                errorTimeout = setTimeout(() => this.hideErrorToast(), 5000);
            }
        });
        
        // Clear timeout when manually closing
        this.errorClose.addEventListener('click', () => {
            if (errorTimeout) clearTimeout(errorTimeout);
        });
        
        // Prevent form submission on Enter
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.target === this.messageInput && !e.shiftKey) {
                e.preventDefault();
            }
        });
    }

    /**
     * Setup Socket.io event listeners
     */
    setupSocketListeners() {
        // Connection events
        this.socket.on('connect', () => {
            console.log('✅ Connected to server');
            this.isConnected = true;
            this.updateConnectionStatus('connected', 'Connected');
            this.hideLoadingOverlay();
        });

        this.socket.on('disconnect', (reason) => {
            console.log('❌ Disconnected from server:', reason);
            this.isConnected = false;
            this.updateConnectionStatus('disconnected', 'Disconnected');
            this.hideTypingIndicator();
            
            if (reason === 'io server disconnect') {
                // Server disconnected the client, reconnect manually
                this.socket.connect();
            }
        });

        this.socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            this.showErrorToast('Failed to connect to server. Please check your connection.');
            this.hideLoadingOverlay();
        });

        // Chat events
        this.socket.on('response', (data) => {
            console.log('📨 Received response:', data);
            this.displayMessage(data.content, 'assistant', data.timestamp);
            this.hideTypingIndicator();
        });

        this.socket.on('typing', (data) => {
            if (data.isTyping) {
                this.showTypingIndicator();
            } else {
                this.hideTypingIndicator();
            }
        });

        this.socket.on('error', (error) => {
            console.error('Server error:', error);
            this.hideTypingIndicator();
            this.showErrorToast(error.message || 'An error occurred while processing your message.');
        });

        // Connection status
        this.socket.on('connection-status', (data) => {
            console.log('Connection status:', data);
        });

        // Ping/pong for connection testing
        this.socket.on('pong', (data) => {
            console.log('🏓 Pong received:', data);
        });
    }

    /**
     * Handle input field keydown events
     */
    handleInputKeydown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.sendMessage();
        } else if (e.key === 'Enter' && e.shiftKey) {
            // Allow new line
            setTimeout(() => this.autoResize(), 0);
        }
    }

    /**
     * Handle input field changes
     */
    handleInputChange() {
        this.autoResize();
        this.updateCharacterCount();
        this.updateSendButtonState();
    }

    /**
     * Send message to server
     */
    sendMessage() {
        const content = this.messageInput.value.trim();
        
        // Validation
        if (!content) return;
        if (!this.isConnected) {
            this.showErrorToast('Not connected to server. Please wait for connection.');
            return;
        }
        if (content.length > 5000) {
            this.showErrorToast('Message too long. Please keep it under 5000 characters.');
            return;
        }

        // Display user message immediately
        this.displayMessage(content, 'user');
        
        // Clear input
        this.messageInput.value = '';
        this.handleInputChange();
        
        // Add to message history
        this.messageHistory.push({
            content,
            type: 'user',
            timestamp: new Date().toISOString()
        });
        
        // Send to server
        const messageData = {
            content: content,
            userId: this.userId
        };
        
        console.log('📤 Sending message:', messageData);
        this.socket.emit('message', messageData);
        
        // Focus input for next message
        this.messageInput.focus();
    }

    /**
     * Display message in chat
     */
    displayMessage(content, type, timestamp = null) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;
        
        // Create avatar
        const avatarDiv = document.createElement('div');
        avatarDiv.className = 'message-avatar';
        avatarDiv.innerHTML = type === 'user' ? '👤' : '🤖';
        
        // Create message content
        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        
        // Create message header
        const messageHeader = document.createElement('div');
        messageHeader.className = 'message-header';
        
        const authorSpan = document.createElement('span');
        authorSpan.className = 'message-author';
        authorSpan.textContent = type === 'user' ? 'You' : 'Assistant';
        
        const timeSpan = document.createElement('span');
        timeSpan.className = 'message-time';
        timeSpan.textContent = this.formatTime(timestamp || new Date().toISOString());
        
        messageHeader.appendChild(authorSpan);
        messageHeader.appendChild(timeSpan);
        
        // Create message body
        const messageBody = document.createElement('div');
        messageBody.className = 'message-body';
        
        if (type === 'assistant') {
            messageBody.innerHTML = this.formatMarkdown(content);
        } else {
            messageBody.textContent = content;
        }
        
        // Assemble message
        messageContent.appendChild(messageHeader);
        messageContent.appendChild(messageBody);
        
        messageDiv.appendChild(avatarDiv);
        messageDiv.appendChild(messageContent);
        
        // Add to messages container
        this.messagesContainer.appendChild(messageDiv);
        
        // Scroll to bottom
        this.scrollToBottom();
        
        return messageDiv;
    }

    /**
     * Format markdown text to HTML
     */
    formatMarkdown(text) {
        return text
            // Headers (must be at start of line)
            .replace(/^### (.*$)/gm, '<h3>$1</h3>')
            .replace(/^## (.*$)/gm, '<h2>$1</h2>')
            .replace(/^# (.*$)/gm, '<h1>$1</h1>')
            // Bold text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            // Code blocks
            .replace(/```(\w+)?\n?([\s\S]*?)```/g, (match, lang, code) => {
                return `<pre><code>${this.escapeHtml(code.trim())}</code></pre>`;
            })
            // Inline code
            .replace(/`([^`\n]+)`/g, '<code>$1</code>')
            // Lists
            .replace(/^\* (.+)$/gm, '<li>$1</li>')
            .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
            .replace(/<\/ul>\s*<ul>/g, '') // Merge consecutive lists
            // Line breaks
            .replace(/\n\n/g, '</p><p>')
            .replace(/\n/g, '<br>')
            // Wrap in paragraphs if not already wrapped
            .replace(/^(?!<[h123]|<ul|<pre|<li)/gm, '<p>')
            .replace(/(?<!>)$/gm, '</p>')
            // Clean up empty paragraphs
            .replace(/<p><\/p>/g, '')
            .replace(/<p>(<[h123]|<ul|<pre)/g, '$1')
            .replace(/(<\/[h123]>|<\/ul>|<\/pre>)<\/p>/g, '$1');
    }

    /**
     * Escape HTML characters
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Format timestamp for display
     */
    formatTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;
        
        // If less than 1 minute ago, show "just now"
        if (diff < 60000) {
            return 'just now';
        }
        
        // If today, show time only
        if (date.toDateString() === now.toDateString()) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        
        // If yesterday, show "yesterday"
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        if (date.toDateString() === yesterday.toDateString()) {
            return 'yesterday';
        }
        
        // Otherwise show date
        return date.toLocaleDateString();
    }

    /**
     * Show typing indicator
     */
    showTypingIndicator() {
        if (!this.isTyping) {
            this.typingIndicator.style.display = 'flex';
            this.isTyping = true;
            this.scrollToBottom();
        }
    }

    /**
     * Hide typing indicator
     */
    hideTypingIndicator() {
        if (this.isTyping) {
            this.typingIndicator.style.display = 'none';
            this.isTyping = false;
        }
    }

    /**
     * Update connection status
     */
    updateConnectionStatus(status, text) {
        this.statusIndicator.className = `status ${status}`;
        this.statusText.textContent = text;
    }

    /**
     * Show loading overlay
     */
    showLoadingOverlay() {
        this.loadingOverlay.style.display = 'flex';
    }

    /**
     * Hide loading overlay
     */
    hideLoadingOverlay() {
        this.loadingOverlay.style.display = 'none';
    }

    /**
     * Show error toast
     */
    showErrorToast(message) {
        this.errorMessage.textContent = message;
        this.errorToast.classList.add('show');
    }

    /**
     * Hide error toast
     */
    hideErrorToast() {
        this.errorToast.classList.remove('show');
    }

    /**
     * Auto-resize textarea
     */
    autoResize() {
        this.messageInput.style.height = 'auto';
        const newHeight = Math.min(this.messageInput.scrollHeight, 120);
        this.messageInput.style.height = newHeight + 'px';
    }

    /**
     * Update character count
     */
    updateCharacterCount() {
        const length = this.messageInput.value.length;
        this.charCount.textContent = length;
        
        // Update styling based on character count
        const countElement = this.charCount.parentElement;
        countElement.classList.remove('warning', 'error');
        
        if (length > 4500) {
            countElement.classList.add('error');
        } else if (length > 4000) {
            countElement.classList.add('warning');
        }
    }

    /**
     * Update send button state
     */
    updateSendButtonState() {
        const hasContent = this.messageInput.value.trim().length > 0;
        const isValid = hasContent && this.isConnected && this.messageInput.value.length <= 5000;
        
        this.sendButton.disabled = !isValid;
    }

    /**
     * Scroll messages container to bottom
     */
    scrollToBottom() {
        setTimeout(() => {
            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        }, 100);
    }

    /**
     * Update welcome message time
     */
    updateWelcomeTime() {
        const welcomeTime = document.getElementById('welcomeTime');
        if (welcomeTime) {
            welcomeTime.textContent = this.formatTime(new Date().toISOString());
        }
    }

    /**
     * Send ping to test connection
     */
    ping() {
        if (this.isConnected) {
            this.socket.emit('ping');
        }
    }

    /**
     * Get message history
     */
    getMessageHistory() {
        return this.messageHistory;
    }

    /**
     * Clear chat history
     */
    clearHistory() {
        this.messageHistory = [];
        // Remove all messages except welcome message
        const messages = this.messagesContainer.querySelectorAll('.message');
        messages.forEach((message, index) => {
            if (index > 0) { // Keep first message (welcome)
                message.remove();
            }
        });
    }
}

// Initialize application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Initializing Claude-like Chat Application');
    
    // Create global app instance
    window.chatApp = new ChatApp();
    
    // Add some global utilities for debugging
    window.chatUtils = {
        ping: () => window.chatApp.ping(),
        clearHistory: () => window.chatApp.clearHistory(),
        getHistory: () => window.chatApp.getMessageHistory(),
        showError: (msg) => window.chatApp.showErrorToast(msg)
    };
    
    console.log('✅ Chat application initialized');
    console.log('💡 Debug utilities available at window.chatUtils');
});