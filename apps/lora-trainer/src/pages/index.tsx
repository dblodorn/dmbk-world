import { View } from "reshaped";
import ArenaChannelFetcher from "@/components/ArenaChannelFetcher";
import WalletStatus from "@/components/WalletStatus";

export default function Home() {
  return (
    <View height="100vh" overflow="hidden">
      <ArenaChannelFetcher />
      <WalletStatus />
    </View>
  );
}
