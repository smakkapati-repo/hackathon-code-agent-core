#!/usr/bin/env python3
"""
Create Amazon Bedrock Guardrail for BankIQ+
Protects against harmful content, financial advice, and inappropriate requests
"""

import boto3
import json
import sys

def create_guardrail():
    """Create Bedrock Guardrail with comprehensive protections"""
    
    client = boto3.client('bedrock', region_name='us-east-1')
    
    print("Creating BankIQ+ Bedrock Guardrail...")
    print("=" * 60)
    
    try:
        response = client.create_guardrail(
            name='bankiq-guardrail',
            description='Content filtering and safety guardrail for BankIQ+ banking analytics platform',
            
            # Content Policy - Filter harmful content
            contentPolicyConfig={
                'filtersConfig': [
                    {
                        'type': 'HATE',
                        'inputStrength': 'HIGH',
                        'outputStrength': 'HIGH'
                    },
                    {
                        'type': 'INSULTS',
                        'inputStrength': 'HIGH',
                        'outputStrength': 'HIGH'
                    },
                    {
                        'type': 'SEXUAL',
                        'inputStrength': 'HIGH',
                        'outputStrength': 'HIGH'
                    },
                    {
                        'type': 'VIOLENCE',
                        'inputStrength': 'HIGH',
                        'outputStrength': 'HIGH'
                    },
                    {
                        'type': 'MISCONDUCT',
                        'inputStrength': 'MEDIUM',
                        'outputStrength': 'MEDIUM'
                    },
                    {
                        'type': 'PROMPT_ATTACK',
                        'inputStrength': 'HIGH',
                        'outputStrength': 'NONE'
                    }
                ]
            },
            
            # Topic Policy - Block specific topics
            topicPolicyConfig={
                'topicsConfig': [
                    {
                        'name': 'FinancialAdvice',
                        'definition': 'Providing investment recommendations, stock picks, buy/sell advice, portfolio allocation suggestions, or personalized financial planning guidance',
                        'examples': [
                            'Should I buy this stock?',
                            'What stocks should I invest in?',
                            'Is this a good time to sell?',
                            'How should I allocate my portfolio?',
                            'Which bank stock will perform best?'
                        ],
                        'type': 'DENY'
                    },
                    {
                        'name': 'LegalAdvice',
                        'definition': 'Providing legal counsel, regulatory compliance advice, or interpretation of laws and regulations',
                        'examples': [
                            'Can I sue this bank?',
                            'What are my legal rights?',
                            'How do I comply with this regulation?'
                        ],
                        'type': 'DENY'
                    },
                    {
                        'name': 'TaxAdvice',
                        'definition': 'Providing tax planning advice, tax optimization strategies, or tax filing guidance',
                        'examples': [
                            'How can I reduce my taxes?',
                            'What tax deductions can I claim?',
                            'Should I use this tax strategy?'
                        ],
                        'type': 'DENY'
                    },
                    {
                        'name': 'PersonalFinance',
                        'definition': 'Providing personalized financial planning, budgeting advice, or debt management strategies',
                        'examples': [
                            'How much should I save?',
                            'Should I pay off my mortgage?',
                            'How do I manage my debt?'
                        ],
                        'type': 'DENY'
                    }
                ]
            },
            
            # Word Policy - Block specific words/phrases
            wordPolicyConfig={
                'wordsConfig': [
                    {'text': 'buy this stock'},
                    {'text': 'sell this stock'},
                    {'text': 'guaranteed returns'},
                    {'text': 'risk-free investment'},
                    {'text': 'get rich quick'},
                    {'text': 'insider tip'},
                    {'text': 'hot stock'},
                    {'text': 'sure thing'}
                ],
                'managedWordListsConfig': [
                    {'type': 'PROFANITY'}
                ]
            },
            
            # Sensitive Information Policy - Redact PII
            sensitiveInformationPolicyConfig={
                'piiEntitiesConfig': [
                    {'type': 'US_SOCIAL_SECURITY_NUMBER', 'action': 'BLOCK'},
                    {'type': 'CREDIT_DEBIT_CARD_NUMBER', 'action': 'BLOCK'},
                    {'type': 'US_BANK_ACCOUNT_NUMBER', 'action': 'BLOCK'},
                    {'type': 'US_BANK_ROUTING_NUMBER', 'action': 'BLOCK'},
                    {'type': 'EMAIL', 'action': 'ANONYMIZE'},
                    {'type': 'PHONE', 'action': 'ANONYMIZE'},
                    {'type': 'NAME', 'action': 'ANONYMIZE'},
                    {'type': 'ADDRESS', 'action': 'ANONYMIZE'}
                ]
            },
            
            blockedInputMessaging='I can only provide banking data analysis. I cannot provide financial advice, investment recommendations, or discuss inappropriate topics. Please ask about banking metrics, financial data, or regulatory compliance.',
            blockedOutputsMessaging='I cannot provide that type of information. I can only assist with factual banking data analysis and metrics.',
            
            tags=[
                {'key': 'Project', 'value': 'BankIQ'},
                {'key': 'Environment', 'value': 'Production'},
                {'key': 'Purpose', 'value': 'ContentSafety'}
            ]
        )
        
        guardrail_id = response['guardrailId']
        guardrail_arn = response['guardrailArn']
        version = response['version']
        
        print(f"✅ Guardrail created successfully!")
        print(f"   ID: {guardrail_id}")
        print(f"   ARN: {guardrail_arn}")
        print(f"   Version: {version}")
        print()
        
        # Create a version (required for use)
        print("Creating guardrail version...")
        version_response = client.create_guardrail_version(
            guardrailIdentifier=guardrail_id,
            description='Initial production version'
        )
        
        version_number = version_response['version']
        print(f"✅ Version created: {version_number}")
        print()
        
        # Save configuration
        config = {
            'guardrailId': guardrail_id,
            'guardrailArn': guardrail_arn,
            'version': version_number
        }
        
        with open('/tmp/guardrail_config.json', 'w') as f:
            json.dump(config, f, indent=2)
        
        print("=" * 60)
        print("📋 NEXT STEPS:")
        print("=" * 60)
        print()
        print("1. Update your agent configuration:")
        print(f"   Add to backend/.bedrock_agentcore.yaml:")
        print(f"   guardrail:")
        print(f"     identifier: {guardrail_id}")
        print(f"     version: '{version_number}'")
        print()
        print("2. Redeploy agent:")
        print("   cd backend && agentcore launch -auc")
        print()
        print("3. Test guardrail:")
        print('   agentcore invoke \'{"prompt": "Should I buy JPMorgan stock?"}\'')
        print("   Expected: Blocked with custom message")
        print()
        print(f"Configuration saved to: /tmp/guardrail_config.json")
        
        return config
        
    except Exception as e:
        print(f"❌ Error creating guardrail: {e}")
        return None

if __name__ == '__main__':
    create_guardrail()
