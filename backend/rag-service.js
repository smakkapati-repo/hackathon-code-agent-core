/**
 * RAG Service - Query Bedrock Knowledge Base for SEC filings
 */

const AWS = require('aws-sdk');

class RAGService {
  constructor() {
    this.client = new AWS.BedrockAgentRuntime({ region: process.env.AWS_REGION || 'us-east-1' });
    this.knowledgeBaseId = process.env.KNOWLEDGE_BASE_ID || null;
  }

  /**
   * Query the knowledge base with RAG
   */
  async query(question, bankName = null, sessionId = null) {
    if (!this.knowledgeBaseId) {
      throw new Error('Knowledge Base ID not configured');
    }

    // Add bank context to query if specified
    const enhancedQuery = bankName 
      ? `For ${bankName}: ${question}`
      : question;

    const input = {
      input: {
        text: enhancedQuery
      },
      retrieveAndGenerateConfiguration: {
        type: 'KNOWLEDGE_BASE',
        knowledgeBaseConfiguration: {
          knowledgeBaseId: this.knowledgeBaseId,
          modelArn: `arn:aws:bedrock:${process.env.AWS_REGION || 'us-east-1'}::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0`,
          retrievalConfiguration: {
            vectorSearchConfiguration: {
              numberOfResults: 5,
              overrideSearchType: 'HYBRID'
            }
          }
        }
      }
    };

    // Add session for multi-turn conversations
    if (sessionId) {
      input.sessionId = sessionId;
    }

    try {
      const response = await this.client.retrieveAndGenerate(input).promise();

      return {
        success: true,
        answer: response.output.text,
        citations: response.citations || [],
        sessionId: response.sessionId,
        sources: this.extractSources(response.citations)
      };
    } catch (error) {
      console.error('RAG query error:', error);
      throw error;
    }
  }

  /**
   * Extract source documents from citations
   */
  extractSources(citations) {
    if (!citations || citations.length === 0) return [];

    const sources = new Set();
    citations.forEach(citation => {
      citation.retrievedReferences?.forEach(ref => {
        if (ref.location?.s3Location?.uri) {
          sources.add(ref.location.s3Location.uri);
        }
      });
    });

    return Array.from(sources);
  }

  /**
   * Get available banks in knowledge base (dynamically from S3)
   */
  async getAvailableBanks() {
    try {
      const s3 = new AWS.S3({ region: process.env.AWS_REGION || 'us-east-1' });
      const s3BucketName = process.env.SEC_FILINGS_BUCKET || 'bankiq-sec-filings-164543933824-prod';
      
      // List all folders (bank names) in the S3 bucket
      const response = await s3.listObjectsV2({
        Bucket: s3BucketName,
        Delimiter: '/'
      }).promise();
      
      // Extract bank folder names from CommonPrefixes
      const banks = (response.CommonPrefixes || [])
        .map(prefix => prefix.Prefix.replace('/', ''))
        .filter(name => name.length > 0)
        .sort();
      
      console.log(`Found ${banks.length} banks in RAG Knowledge Base:`, banks);
      
      return banks;
    } catch (error) {
      console.error('Error listing banks from S3:', error);
      // Fallback to original top 10 banks if S3 fails
      return [
        'JPMORGAN-CHASE',
        'BANK-OF-AMERICA',
        'WELLS-FARGO',
        'CITIGROUP',
        'US-BANCORP',
        'PNC-FINANCIAL',
        'GOLDMAN-SACHS',
        'TRUIST-FINANCIAL',
        'CAPITAL-ONE',
        'MORGAN-STANLEY'
      ];
    }
  }
}

module.exports = new RAGService();
