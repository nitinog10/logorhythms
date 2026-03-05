# DocuSense-AI Deployment Guide

Deploy the **backend on AWS** (App Runner + DynamoDB + S3) and the **frontend on Netlify**, both connected to your GitHub repository.

---

## Prerequisites

- **AWS Account** with an IAM user that has permissions for DynamoDB, S3, and App Runner
- **Netlify Account** ([netlify.com](https://netlify.com))
- **GitHub Repository** with this codebase pushed
- **GitHub OAuth App** — you'll update its callback URL after deployment

---

## Step 1: Create AWS DynamoDB Tables

Go to **AWS Console → DynamoDB → Create Table** and create the following 6 tables.  
Leave all other settings as default (On-demand capacity mode recommended).

| Table Name | Partition Key | Sort Key |
|---|---|---|
| `docusense_users` | `id` (String) | — |
| `docusense_repositories` | `id` (String) | — |
| `docusense_walkthroughs` | `id` (String) | — |
| `docusense_audio_walkthroughs` | `id` (String) | — |
| `docusense_documentation_cache` | `repo_id` (String) | — |
| `docusense_code_chunks` | `repository_id` (String) | `id` (String) |

> **Tip:** You can also create these tables using AWS CLI:
> ```bash
> aws dynamodb create-table --table-name docusense_users \
>   --attribute-definitions AttributeName=id,AttributeType=S \
>   --key-schema AttributeName=id,KeyType=HASH \
>   --billing-mode PAY_PER_REQUEST --region ap-south-1
>
> aws dynamodb create-table --table-name docusense_repositories \
>   --attribute-definitions AttributeName=id,AttributeType=S \
>   --key-schema AttributeName=id,KeyType=HASH \
>   --billing-mode PAY_PER_REQUEST --region ap-south-1
>
> aws dynamodb create-table --table-name docusense_walkthroughs \
>   --attribute-definitions AttributeName=id,AttributeType=S \
>   --key-schema AttributeName=id,KeyType=HASH \
>   --billing-mode PAY_PER_REQUEST --region ap-south-1
>
> aws dynamodb create-table --table-name docusense_audio_walkthroughs \
>   --attribute-definitions AttributeName=id,AttributeType=S \
>   --key-schema AttributeName=id,KeyType=HASH \
>   --billing-mode PAY_PER_REQUEST --region ap-south-1
>
> aws dynamodb create-table --table-name docusense_documentation_cache \
>   --attribute-definitions AttributeName=repo_id,AttributeType=S \
>   --key-schema AttributeName=repo_id,KeyType=HASH \
>   --billing-mode PAY_PER_REQUEST --region ap-south-1
>
> aws dynamodb create-table --table-name docusense_code_chunks \
>   --attribute-definitions AttributeName=repository_id,AttributeType=S AttributeName=id,AttributeType=S \
>   --key-schema AttributeName=repository_id,KeyType=HASH AttributeName=id,KeyType=RANGE \
>   --billing-mode PAY_PER_REQUEST --region ap-south-1
> ```

---

## Step 2: Create AWS S3 Bucket

Go to **AWS Console → S3 → Create Bucket**:
- **Bucket name:** `docusense-audio` (or your preferred name)
- **Region:** Same as DynamoDB (e.g., `ap-south-1`)
- **Block all public access:** Keep enabled (backend accesses via IAM credentials)
- Click **Create bucket**

---

## Step 3: Create IAM User for Backend

Go to **AWS Console → IAM → Users → Create User**:

1. **User name:** `docusense-backend`
2. **Attach policies directly:**
   - `AmazonDynamoDBFullAccess`
   - `AmazonS3FullAccess`
3. **Create access key:**
   - Go to the user → **Security credentials** → **Create access key**
   - Choose **Application running outside AWS**
   - **Save the Access Key ID and Secret Access Key** — you'll need these in Step 4

---

## Step 4: Deploy Backend on AWS App Runner

### Option A: Deploy via AWS Console

1. Go to **AWS Console → App Runner → Create Service**
2. **Source:** Select **Source code repository**
3. **Connect to GitHub** → Select your repository
4. **Source directory:** `/backend`
5. **Deployment trigger:** **Automatic** (deploys on every push)
6. **Build settings:**
   - **Runtime:** Docker
   - **Port:** `8000`
7. **Service name:** `docusense-api`
8. **Environment variables** — Add these:

   | Variable | Value |
   |---|---|
   | `SECRET_KEY` | Generate a random string (e.g., run `openssl rand -hex 32`) |
   | `OPENAI_API_KEY` | Your OpenAI API key |
   | `AWS_REGION` | `ap-south-1` |
   | `AWS_ACCESS_KEY_ID` | From Step 3 |
   | `AWS_SECRET_ACCESS_KEY` | From Step 3 |
   | `DYNAMODB_TABLE_PREFIX` | `docusense` |
   | `S3_AUDIO_BUCKET` | `docusense-audio` |
   | `GITHUB_CLIENT_ID` | Your GitHub OAuth App Client ID |
   | `GITHUB_CLIENT_SECRET` | Your GitHub OAuth App Client Secret |
   | `GITHUB_REDIRECT_URI` | `https://YOUR-NETLIFY-URL.netlify.app/api/auth/callback/github` (update after Step 5) |
   | `FRONTEND_URL` | `https://YOUR-NETLIFY-URL.netlify.app` (update after Step 5) |
   | `EXTRA_CORS_ORIGINS` | `https://YOUR-NETLIFY-URL.netlify.app` (update after Step 5) |
   | `ELEVENLABS_API_KEY` | Your ElevenLabs API key (optional) |

9. Click **Create & Deploy**
10. Once deployed, **copy the App Runner service URL** (e.g., `https://abc123.ap-south-1.awsapprunner.com`)

### Option B: Deploy via AWS CLI

```bash
# First, push your code to GitHub, then:
aws apprunner create-service \
  --service-name docusense-api \
  --source-configuration '{
    "CodeRepository": {
      "RepositoryUrl": "https://github.com/YOUR-USERNAME/DocuSense-Ai",
      "SourceCodeVersion": {"Type": "BRANCH", "Value": "main"},
      "SourceDirectory": "/backend",
      "CodeConfiguration": {
        "ConfigurationSource": "API",
        "CodeConfigurationValues": {
          "Runtime": "PYTHON_3",
          "Port": "8000",
          "StartCommand": "gunicorn app.main:app --worker-class uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000 --workers 1 --timeout 120",
          "BuildCommand": "pip install -r requirements.txt",
          "RuntimeEnvironmentVariables": {
            "SECRET_KEY": "YOUR_SECRET_KEY",
            "OPENAI_API_KEY": "YOUR_OPENAI_KEY",
            "AWS_REGION": "ap-south-1",
            "AWS_ACCESS_KEY_ID": "YOUR_KEY",
            "AWS_SECRET_ACCESS_KEY": "YOUR_SECRET",
            "DYNAMODB_TABLE_PREFIX": "docusense",
            "S3_AUDIO_BUCKET": "docusense-audio"
          }
        }
      }
    },
    "AutoDeploymentsEnabled": true,
    "AuthenticationConfiguration": {
      "ConnectionArn": "YOUR_GITHUB_CONNECTION_ARN"
    }
  }' \
  --region ap-south-1
```

---

## Step 5: Deploy Frontend on Netlify

1. Go to **[netlify.com](https://app.netlify.com)** → **Add new site** → **Import an existing project**
2. **Connect to GitHub** → Select your repository
3. Netlify will auto-detect the `netlify.toml` config in `frontend/`
4. **Build settings** (should auto-populate from `netlify.toml`):
   - **Base directory:** `frontend`
   - **Build command:** `npm run build`
   - **Publish directory:** `frontend/.next`
5. **Environment variables** — Add these:

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_API_URL` | `https://YOUR-APP-RUNNER-URL.awsapprunner.com/api` (from Step 4) |

6. Click **Deploy site**
7. **Copy your Netlify URL** (e.g., `https://docusense-ai.netlify.app`)

### Set a Custom Domain (Optional)
- Go to **Site settings → Domain management → Add custom domain**

---

## Step 6: Update Cross-References

After both services are deployed, you need to update the URLs that reference each other.

### 6a. Update AWS App Runner Environment Variables

Go to **App Runner → Your Service → Configuration → Edit**. Update:

| Variable | Value |
|---|---|
| `FRONTEND_URL` | `https://YOUR-NETLIFY-URL.netlify.app` |
| `EXTRA_CORS_ORIGINS` | `https://YOUR-NETLIFY-URL.netlify.app` |
| `GITHUB_REDIRECT_URI` | `https://YOUR-NETLIFY-URL.netlify.app/api/auth/callback/github` |

### 6b. Update GitHub OAuth App

Go to **GitHub → Settings → Developer Settings → OAuth Apps → Your App**:
- **Homepage URL:** `https://YOUR-NETLIFY-URL.netlify.app`
- **Authorization callback URL:** `https://YOUR-NETLIFY-URL.netlify.app/api/auth/callback/github`

---

## Step 7: Verify Deployment

1. Open your Netlify URL in the browser
2. Click **Sign in with GitHub** → Should redirect to GitHub → Back to your app
3. **Connect a repository** → Should clone and show the file tree
4. **Generate a walkthrough** → Should work via OpenAI
5. Test the **health endpoint**: `https://YOUR-APP-RUNNER-URL.awsapprunner.com/health`

---

## Environment Variables Summary

### Backend (AWS App Runner)

| Variable | Required | Description |
|---|---|---|
| `SECRET_KEY` | ✅ | JWT signing key |
| `OPENAI_API_KEY` | ✅ | OpenAI API key |
| `AWS_REGION` | ✅ | AWS region (e.g., `ap-south-1`) |
| `AWS_ACCESS_KEY_ID` | ✅ | IAM access key |
| `AWS_SECRET_ACCESS_KEY` | ✅ | IAM secret key |
| `DYNAMODB_TABLE_PREFIX` | ✅ | Table name prefix (default: `docusense`) |
| `S3_AUDIO_BUCKET` | ✅ | S3 bucket for audio files |
| `GITHUB_CLIENT_ID` | ✅ | GitHub OAuth client ID |
| `GITHUB_CLIENT_SECRET` | ✅ | GitHub OAuth client secret |
| `GITHUB_REDIRECT_URI` | ✅ | OAuth callback URL |
| `FRONTEND_URL` | ✅ | Netlify frontend URL |
| `EXTRA_CORS_ORIGINS` | ✅ | Extra CORS origins (comma-separated) |
| `ELEVENLABS_API_KEY` | ❌ | ElevenLabs TTS key (optional) |
| `ELEVENLABS_VOICE_ID` | ❌ | ElevenLabs voice (default: Rachel) |
| `ELEVENLABS_MODEL_ID` | ❌ | ElevenLabs model |

### Frontend (Netlify)

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | ✅ | Backend API URL with `/api` suffix |

---

## Troubleshooting

| Issue | Solution |
|---|---|
| **CORS errors in browser** | Make sure `FRONTEND_URL` and `EXTRA_CORS_ORIGINS` in App Runner match your Netlify URL exactly |
| **OAuth redirect fails** | Check `GITHUB_REDIRECT_URI` in both App Runner env vars AND GitHub OAuth App settings |
| **DynamoDB errors** | Verify all 6 tables exist with correct names and key schemas |
| **502 on App Runner** | Check logs in App Runner console; ensure `PORT=8000` is set |
| **Netlify build fails** | Ensure `@netlify/plugin-nextjs` is listed in `netlify.toml`; check Node version |
| **Audio not playing** | Verify S3 bucket exists and IAM user has `s3:PutObject` and `s3:GetObject` permissions |

---

## Architecture Overview

```
┌─────────────────────┐        ┌──────────────────────────┐
│     Netlify          │        │     AWS App Runner       │
│  (Next.js Frontend)  │───────▶│    (FastAPI Backend)     │
│                      │  API   │                          │
└─────────────────────┘        └──────────┬───────────────┘
                                          │
                               ┌──────────┼───────────────┐
                               │          │               │
                        ┌──────▼──┐  ┌────▼─────┐  ┌─────▼────┐
                        │ DynamoDB │  │    S3    │  │  GitHub  │
                        │ (6 tables│  │ (audio) │  │   API    │
                        │  data)   │  └──────────┘  └──────────┘
                        └──────────┘
```
