import sys
import os
import boto3
from botocore.exceptions import ClientError

# Add the parent directory to sys.path so we can import from app
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.config import get_settings

settings = get_settings()

def create_builder_table():
    print(f"Creating DynamoDB table in region: {settings.aws_region}")
    
    kwargs = {"region_name": settings.aws_region}
    if settings.aws_access_key_id and settings.aws_secret_access_key:
        kwargs["aws_access_key_id"] = settings.aws_access_key_id
        kwargs["aws_secret_access_key"] = settings.aws_secret_access_key
        
    dynamodb = boto3.resource("dynamodb", **kwargs)
    
    table_name = f"{settings.dynamodb_table_prefix}_builder_projects"
    print(f"Table name: {table_name}")
    
    try:
        table = dynamodb.create_table(
            TableName=table_name,
            KeySchema=[
                {
                    'AttributeName': 'id',
                    'KeyType': 'HASH'  # Partition key
                }
            ],
            AttributeDefinitions=[
                {
                    'AttributeName': 'id',
                    'AttributeType': 'S'
                }
            ],
            BillingMode='PAY_PER_REQUEST'
        )
        
        print("Waiting for table to be created (this may take a minute)...")
        table.meta.client.get_waiter('table_exists').wait(TableName=table_name)
        print(f"✅ Success! Table {table_name} is now active.")
        
    except ClientError as e:
        if e.response['Error']['Code'] == 'ResourceInUseException':
            print(f"⚠️ Table {table_name} already exists.")
        else:
            print(f"❌ Error creating table: {e}")
            sys.exit(1)

if __name__ == "__main__":
    create_builder_table()
