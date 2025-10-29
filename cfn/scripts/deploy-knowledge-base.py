#!/usr/bin/env python3
"""
RAG Phase 3: Create Bedrock Knowledge Base and start vector indexing
"""

import boto3
import json
import time
import sys

# Check for required packages
try:
    from opensearchpy import OpenSearch, RequestsHttpConnection, AWSV4SignerAuth
except ImportError:
    print("⚠️  Installing opensearch-py...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "opensearch-py"])
    from opensearchpy import OpenSearch, RequestsHttpConnection, AWSV4SignerAuth

def get_stack_outputs(stack_name='bankiq-infra'):
    cfn = boto3.client('cloudformation')
    response = cfn.describe_stacks(StackName=stack_name)
    outputs = {}
    for output in response['Stacks'][0]['Outputs']:
        outputs[output['OutputKey']] = output['OutputValue']
    return outputs

def check_collection_status():
    """Wait for OpenSearch collection to be ACTIVE"""
    aoss = boto3.client('opensearchserverless')
    collection_name = "bankiq-vectors-prod"
    
    print("\n🔍 Checking OpenSearch collection status...")
    
    max_wait = 120
    waited = 0
    while waited < max_wait:
        try:
            collections = aoss.list_collections(
                collectionFilters={'name': collection_name}
            )
            if collections['collectionSummaries']:
                collection = collections['collectionSummaries'][0]
                status = collection['status']
                if status == 'ACTIVE':
                    print(f"✅ Collection is ACTIVE")
                    return True
                else:
                    print(f"   Status: {status}, waiting... ({waited}s)")
            time.sleep(10)
            waited += 10
        except Exception as e:
            print(f"   Waiting for collection... ({waited}s)")
            time.sleep(10)
            waited += 10
    
    print(f"❌ Collection not ACTIVE after {max_wait}s")
    return False

def create_opensearch_index():
    """Create the vector index in OpenSearch Serverless - REQUIRED before KB creation"""
    outputs = get_stack_outputs()
    collection_endpoint = outputs['VectorStoreCollectionEndpoint']
    index_name = 'bankiq-sec-index'
    
    print(f"\n🔧 Creating OpenSearch vector index: {index_name}")
    
    # Get AWS credentials for signing requests
    credentials = boto3.Session().get_credentials()
    auth = AWSV4SignerAuth(credentials, boto3.session.Session().region_name, 'aoss')
    
    # Extract host from endpoint URL
    host = collection_endpoint.replace('https://', '')
    
    # Create OpenSearch client
    client = OpenSearch(
        hosts=[{'host': host, 'port': 443}],
        http_auth=auth,
        use_ssl=True,
        verify_certs=True,
        connection_class=RequestsHttpConnection,
        timeout=30
    )
    
    # Check if index already exists
    if client.indices.exists(index=index_name):
        print(f"✅ Index '{index_name}' already exists")
        return True
    
    # Create index with vector field mapping for Titan Embeddings v2 (1024 dimensions)
    index_body = {
        "settings": {
            "index.knn": True,
            "number_of_shards": 2,
            "number_of_replicas": 0
        },
        "mappings": {
            "properties": {
                "embedding": {
                    "type": "knn_vector",
                    "dimension": 1024,
                    "method": {
                        "name": "hnsw",
                        "engine": "faiss",
                        "parameters": {
                            "ef_construction": 512,
                            "m": 16
                        }
                    }
                },
                "text": {
                    "type": "text"
                },
                "metadata": {
                    "type": "text",
                    "index": False
                }
            }
        }
    }
    
    try:
        client.indices.create(index=index_name, body=index_body)
        print(f"✅ Created index '{index_name}' with 1024-dim vector field")
        
        # Poll until index is accessible
        print(f"⏳ Waiting for index to be fully available...")
        max_wait = 60
        waited = 0
        while waited < max_wait:
            if client.indices.exists(index=index_name):
                print(f"✅ Index verified and accessible ({waited}s)")
                return True
            time.sleep(5)
            waited += 5
        
        print(f"⚠️  Index created but not accessible after {max_wait}s")
        return False
            
    except Exception as e:
        print(f"❌ Error creating index: {e}")
        return False

def create_knowledge_base():
    bedrock = boto3.client('bedrock-agent')
    outputs = get_stack_outputs()
    
    # Get AWS account ID and timestamp for unique KB name
    import time
    account_id = boto3.client('sts').get_caller_identity()['Account']
    timestamp = int(time.time())
    kb_name = f"bankiq-sec-filings-kb-{account_id}-{timestamp}"
    
    print(f"\n📚 Creating Knowledge Base: {kb_name}")
    
    # Check if KB already exists
    try:
        kbs = bedrock.list_knowledge_bases()
        for kb in kbs.get('knowledgeBaseSummaries', []):
            if kb['name'] == kb_name:
                print(f"⚠️  Knowledge Base already exists: {kb['knowledgeBaseId']}")
                return kb['knowledgeBaseId']
    except Exception as e:
        print(f"   Error checking existing KBs: {e}")
    
    # Poll OpenSearch to ensure index is stable before KB creation
    print("⏳ Verifying index stability...")
    aoss = boto3.client('opensearchserverless')
    outputs = get_stack_outputs()
    collection_endpoint = outputs['VectorStoreCollectionEndpoint']
    host = collection_endpoint.replace('https://', '')
    credentials = boto3.Session().get_credentials()
    auth = AWSV4SignerAuth(credentials, boto3.session.Session().region_name, 'aoss')
    client = OpenSearch(
        hosts=[{'host': host, 'port': 443}],
        http_auth=auth,
        use_ssl=True,
        verify_certs=True,
        connection_class=RequestsHttpConnection,
        timeout=30
    )
    
    max_wait = 60
    waited = 0
    while waited < max_wait:
        try:
            if client.indices.exists(index='bankiq-sec-index'):
                health = client.cluster.health()
                if health['status'] in ['green', 'yellow']:
                    print(f"✅ Index stable and ready ({waited}s)")
                    break
            time.sleep(5)
            waited += 5
        except:
            time.sleep(5)
            waited += 5
    
    try:
        response = bedrock.create_knowledge_base(
            name=kb_name,
            description="BankIQ+ SEC filings knowledge base with vector search",
            roleArn=outputs['BedrockKnowledgeBaseRoleArn'],
            knowledgeBaseConfiguration={
                'type': 'VECTOR',
                'vectorKnowledgeBaseConfiguration': {
                    'embeddingModelArn': f"arn:aws:bedrock:{boto3.session.Session().region_name}::foundation-model/amazon.titan-embed-text-v2:0"
                }
            },
            storageConfiguration={
                'type': 'OPENSEARCH_SERVERLESS',
                'opensearchServerlessConfiguration': {
                    'collectionArn': outputs['VectorStoreCollectionArn'],
                    'vectorIndexName': 'bankiq-sec-index',
                    'fieldMapping': {
                        'vectorField': 'embedding',
                        'textField': 'text',
                        'metadataField': 'metadata'
                    }
                }
            }
        )
        
        kb_id = response['knowledgeBase']['knowledgeBaseId']
        print(f"✅ Knowledge Base created: {kb_id}")
        return kb_id
        
    except Exception as e:
        print(f"❌ Error creating Knowledge Base: {e}")
        print("\nTroubleshooting:")
        print("1. Verify OpenSearch collection is active:")
        print(f"   aws opensearchserverless list-collections --region {boto3.session.Session().region_name}")
        print("2. Check access policy:")
        print(f"   aws opensearchserverless list-access-policies --type data --region {boto3.session.Session().region_name}")
        print("3. Verify index exists:")
        print(f"   Check OpenSearch console for index 'bankiq-sec-index'")
        print("4. Manually retry:")
        print("   python3 cfn/scripts/deploy-knowledge-base.py")
        sys.exit(1)

def create_data_source(kb_id):
    bedrock = boto3.client('bedrock-agent')
    outputs = get_stack_outputs()
    
    print(f"\n📂 Creating Data Source for KB: {kb_id}")
    
    # Check if data source already exists
    try:
        data_sources = bedrock.list_data_sources(knowledgeBaseId=kb_id)
        for ds in data_sources.get('dataSourceSummaries', []):
            if ds['name'] == 'sec-filings-s3-source':
                print(f"⚠️  Data Source already exists: {ds['dataSourceId']}")
                return ds['dataSourceId']
    except Exception as e:
        print(f"   Error checking existing data sources: {e}")
    
    try:
        response = bedrock.create_data_source(
            knowledgeBaseId=kb_id,
            name="sec-filings-s3-source",
            description="S3 bucket containing SEC 10-K and 10-Q filings",
            dataSourceConfiguration={
                'type': 'S3',
                's3Configuration': {
                    'bucketArn': outputs['SECFilingsBucketArn']
                }
            },
            vectorIngestionConfiguration={
                'chunkingConfiguration': {
                    'chunkingStrategy': 'FIXED_SIZE',
                    'fixedSizeChunkingConfiguration': {
                        'maxTokens': 512,
                        'overlapPercentage': 20
                    }
                }
            }
        )
        
        ds_id = response['dataSource']['dataSourceId']
        print(f"✅ Data Source created: {ds_id}")
        return ds_id
        
    except Exception as e:
        print(f"❌ Error creating Data Source: {e}")
        sys.exit(1)

def start_ingestion(kb_id, ds_id):
    bedrock = boto3.client('bedrock-agent')
    
    # Wait for KB to be ACTIVE
    print(f"\n⏳ Waiting for Knowledge Base to be ACTIVE...")
    max_wait = 60
    waited = 0
    while waited < max_wait:
        kb = bedrock.get_knowledge_base(knowledgeBaseId=kb_id)
        status = kb['knowledgeBase']['status']
        if status == 'ACTIVE':
            print(f"✅ Knowledge Base is ACTIVE")
            break
        print(f"   Status: {status} ({waited}s)")
        time.sleep(5)
        waited += 5
    
    print(f"\n🔄 Starting ingestion job...")
    
    try:
        response = bedrock.start_ingestion_job(
            knowledgeBaseId=kb_id,
            dataSourceId=ds_id
        )
        
        job_id = response['ingestionJob']['ingestionJobId']
        print(f"✅ Ingestion job started: {job_id}")
        print(f"\n📊 Monitor progress:")
        print(f"  aws bedrock-agent get-ingestion-job --knowledge-base-id {kb_id} --data-source-id {ds_id} --ingestion-job-id {job_id}")
        
        return job_id
        
    except Exception as e:
        print(f"❌ Error starting ingestion: {e}")
        sys.exit(1)

def main():
    print("="*60)
    print("RAG Phase 3: Knowledge Base Setup")
    print("="*60)
    
    # Step 1: Check collection status
    if not check_collection_status():
        print("\n❌ OpenSearch collection not ready")
        sys.exit(1)
    
    # Step 2: Poll for access policy propagation
    print("\n⏳ Waiting for access policies to propagate...")
    aoss = boto3.client('opensearchserverless')
    max_wait = 90
    waited = 0
    while waited < max_wait:
        try:
            policies = aoss.list_access_policies(type='data')
            if any('bankiq' in p.get('name', '') for p in policies.get('accessPolicySummaries', [])):
                print(f"✅ Access policies active ({waited}s)")
                break
        except:
            pass
        time.sleep(5)
        waited += 5
    
    # Step 3: Create OpenSearch index (REQUIRED before KB creation)
    if not create_opensearch_index():
        print("\n❌ Failed to create OpenSearch index")
        sys.exit(1)
    
    # Step 4: Create Knowledge Base
    kb_id = create_knowledge_base()
    
    # Step 5: Create Data Source
    ds_id = create_data_source(kb_id)
    
    # Step 6: Start Ingestion
    job_id = start_ingestion(kb_id, ds_id)
    
    print("\n" + "="*60)
    print("✅ KNOWLEDGE BASE SETUP COMPLETE")
    print("="*60)
    print(f"Knowledge Base ID: {kb_id}")
    print(f"Data Source ID: {ds_id}")
    print(f"Ingestion Job ID: {job_id}")
    print(f"\n📊 Ingestion will run in background (5-15 minutes)")
    print(f"\n💡 Next: Backend will automatically use KB ID: {kb_id}")

if __name__ == "__main__":
    main()
