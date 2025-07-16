# Environment Variables Setup

This document explains how to set up the `FAL_AI_API_KEY` for use in both the API package and lora-trainer web app.

## Quick Setup

1. **Get your FAL AI API Key**

   - Visit [https://fal.ai/dashboard](https://fal.ai/dashboard)
   - Sign up or log in to your account
   - Generate or copy your API key

2. **Create the environment file**

   ```bash
   # In the project root directory
   touch .env.local
   ```

3. **Add your API key**

   ```bash
   # Add this line to .env.local
   FAL_AI_API_KEY=your_actual_fal_ai_api_key_here
   ```

4. **Restart the development server**
   ```bash
   pnpm dev
   ```

## Security Notes

- ✅ `.env.local` files are already configured to be ignored by git
- ✅ Your API key will NOT be committed to the repository
- ✅ The API key is only accessible server-side (not exposed to browsers)
- ⚠️ Never commit API keys to version control
- ⚠️ Don't share your `.env.local` file

## Testing the Setup

1. Start the development server:

   ```bash
   pnpm dev:lora-trainer
   ```

2. Visit [http://localhost:3000](http://localhost:3000)

3. Look for the "FAL AI Configuration Test" component at the top of the page

4. You should see:
   - ✅ **API Key Configured: Yes** (green checkmark)
   - A preview of your API key (first 8 characters + "...")

If you see "❌ API Key Configured: No", double-check your setup steps.

## How It Works

### API Package (`packages/api`)

- Uses `dotenv` to load environment variables
- Validates the `FAL_AI_API_KEY` using Zod schema
- Located in `packages/api/src/env.ts`

### Next.js App (`apps/lora-trainer`)

- Automatically loads `.env.local` files
- Validates environment variables in `apps/lora-trainer/src/env.ts`
- API key is only accessible server-side for security

### File Locations

```
dmbk-world/
├── .env.local                     # ← Create this file (gitignored)
├── packages/api/src/env.ts        # ← Environment validation for API
└── apps/lora-trainer/src/env.ts   # ← Environment validation for Next.js
```

## Troubleshooting

### Error: "FAL_AI_API_KEY is required"

- Make sure `.env.local` exists in the project root
- Verify the API key is set: `FAL_AI_API_KEY=your_key`
- No spaces around the `=` sign
- Restart the development server

### Error: "Invalid environment variables"

- Check that your API key is not empty
- Make sure there are no extra quotes around the key
- Verify the file is named `.env.local` (not `.env.txt` or similar)

### Still not working?

1. Check the file exists: `ls -la .env.local`
2. Check the content: `cat .env.local`
3. Restart the entire development process
4. Check the browser console for additional error messages

## Example .env.local

```bash
# FAL AI Configuration
FAL_AI_API_KEY=fal_1234567890abcdef1234567890abcdef

# Optional: Add other environment variables here as needed
# NODE_ENV=development
```
