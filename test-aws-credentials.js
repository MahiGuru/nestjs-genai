#!/usr/bin/env node

/**
 * AWS Bedrock Credentials Test Script
 * Run this to verify your AWS credentials work before starting the app
 * 
 * Usage: node test-aws-credentials.js
 */

const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');

// Load environment variables
require('dotenv').config();

async function testAwsCredentials() {
    console.log('🧪 Testing AWS Bedrock Credentials...\n');
    
    // Check environment variables
    console.log('📋 Environment Variables:');
    console.log('   AWS_REGION:', process.env.AWS_REGION || '❌ NOT SET');
    console.log('   AWS_ACCESS_KEY_ID:', process.env.AWS_ACCESS_KEY_ID ? '✅ SET' : '❌ NOT SET');
    console.log('   AWS_SECRET_ACCESS_KEY:', process.env.AWS_SECRET_ACCESS_KEY ? '✅ SET' : '❌ NOT SET');
    console.log('   BEDROCK_MODEL_ID:', process.env.BEDROCK_MODEL_ID || '❌ NOT SET');
    console.log('');

    // Check for missing credentials
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
        console.error('❌ AWS credentials not found!');
        console.error('💡 Please check your .env file contains:');
        console.error('   AWS_ACCESS_KEY_ID=your_access_key');
        console.error('   AWS_SECRET_ACCESS_KEY=your_secret_key');
        process.exit(1);
    }

    try {
        console.log('🔧 Creating Bedrock client...');
        
        const client = new BedrockRuntimeClient({
            region: process.env.AWS_REGION || 'us-east-1',
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
        });

        console.log('✅ Bedrock client created successfully');
        
        console.log('📡 Testing API connection...');
        
        // Test with a simple request
        const modelId = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-sonnet-20240229-v1:0';
        
        const requestBody = {
            anthropic_version: "bedrock-2023-05-31",
            max_tokens: 100,
            temperature: 0.7,
            messages: [{
                role: 'user',
                content: 'Hello! Please respond with just "AWS Bedrock test successful" to confirm the connection.'
            }]
        };

        const command = new InvokeModelCommand({
            modelId: modelId,
            contentType: 'application/json',
            accept: 'application/json',
            body: JSON.stringify(requestBody),
        });

        const response = await client.send(command);
        const responseBody = JSON.parse(new TextDecoder().decode(response.body));
        
        console.log('✅ API test successful!');
        console.log('🤖 Model response:', responseBody.content[0].text);
        console.log('📊 Token usage:', {
            input: responseBody.usage?.input_tokens || 0,
            output: responseBody.usage?.output_tokens || 0
        });
        
        console.log('\n🎉 SUCCESS! Your AWS Bedrock integration is working correctly.');
        console.log('🚀 You can now run: npm run start:dev');
        
    } catch (error) {
        console.error('\n❌ AWS Bedrock test failed!');
        console.error('Error:', error.message);
        
        // Provide specific error help
        if (error.message.includes('security token')) {
            console.error('\n💡 This error usually means:');
            console.error('   1. Invalid AWS Access Key ID or Secret Access Key');
            console.error('   2. Credentials are expired or deactivated');
            console.error('   3. Wrong AWS region (try us-east-1)');
            console.error('\n🔧 Try these solutions:');
            console.error('   1. Double-check your credentials in AWS IAM Console');
            console.error('   2. Create new credentials and update your .env file');
            console.error('   3. Make sure your .env file is in the project root');
        } else if (error.message.includes('access')) {
            console.error('\n💡 This error usually means:');
            console.error('   1. Your IAM user doesn\'t have Bedrock permissions');
            console.error('   2. The model isn\'t enabled in your AWS account');
            console.error('\n🔧 Try these solutions:');
            console.error('   1. Add bedrock:InvokeModel permission to your IAM user');
            console.error('   2. Enable Claude 3 models in AWS Bedrock Console');
        } else if (error.message.includes('region')) {
            console.error('\n💡 This error usually means:');
            console.error('   1. Bedrock isn\'t available in your region');
            console.error('   2. The model isn\'t available in your region');
            console.error('\n🔧 Try these solutions:');
            console.error('   1. Set AWS_REGION=us-east-1 in your .env file');
            console.error('   2. Or try AWS_REGION=us-west-2');
        }
        
        process.exit(1);
    }
}

// Run the test
testAwsCredentials().catch(console.error);