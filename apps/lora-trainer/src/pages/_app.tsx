import "reshaped/globals.css";
import "reshaped/themes/lora-trainer/theme.css";
import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { trpc } from "@/utils/trpc";
import { useState } from "react";
import { Reshaped } from "reshaped";

export default function App({ Component, pageProps }: AppProps) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: "/api/trpc",
        }),
      ],
    })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <Reshaped theme="lora-trainer">
          <Component {...pageProps} />
        </Reshaped>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
