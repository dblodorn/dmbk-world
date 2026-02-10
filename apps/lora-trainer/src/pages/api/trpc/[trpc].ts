import { createNextApiHandler } from "@trpc/server/adapters/next";
import { appRouter } from "@dmbk-world/api";
import type { NextApiRequest, NextApiResponse } from "next";

// #region agent log
fetch('http://127.0.0.1:7245/ingest/85cb3862-0b23-4cd2-9eab-199a5e649536',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'[trpc].ts:module-load',message:'Module loaded, checking appRouter',data:{hasRouter: !!appRouter, typeofRouter: typeof appRouter},timestamp:Date.now(),hypothesisId:'H7-verify'})}).catch(()=>{});
// #endregion

const handler = createNextApiHandler({
  router: appRouter,
  createContext: () => ({}),
});

export default async function trpcHandler(req: NextApiRequest, res: NextApiResponse) {
  // #region agent log
  fetch('http://127.0.0.1:7245/ingest/85cb3862-0b23-4cd2-9eab-199a5e649536',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'[trpc].ts:request',message:'tRPC request received',data:{url: req.url, method: req.method, hasRouter: !!appRouter},timestamp:Date.now(),hypothesisId:'all'})}).catch(()=>{});
  // #endregion
  try {
    return await handler(req, res);
  } catch (err: any) {
    // #region agent log
    fetch('http://127.0.0.1:7245/ingest/85cb3862-0b23-4cd2-9eab-199a5e649536',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'[trpc].ts:handler-error',message:'Handler threw error',data:{error: err?.message, stack: err?.stack?.slice(0, 500)},timestamp:Date.now(),hypothesisId:'all'})}).catch(()=>{});
    // #endregion
    throw err;
  }
}
