import { Geist, Geist_Mono } from "next/font/google";
import ArenaChannelFetcher from "@/components/ArenaChannelFetcher";
import FalTest from "@/components/FalTest";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function Home() {
  return (
    <div
      className={`${geistSans.className} ${geistMono.className} min-h-screen p-8 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-geist-sans)]`}
    >
      <main className="flex flex-col gap-[32px] items-center">
        <FalTest />
        <ArenaChannelFetcher />
      </main>
    </div>
  );
}
