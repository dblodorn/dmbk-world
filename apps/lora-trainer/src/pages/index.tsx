import { View } from "reshaped";
import ArenaChannelFetcher from "@/components/ArenaChannelFetcher";
import WalletStatus from "@/components/WalletStatus";

export default function Home() {
  return (
    <View height="100vh" overflow="hidden">
      <View
        direction="row"
        align="center"
        justify="end"
        padding={4}
      >
        <WalletStatus />
      </View>
      <ArenaChannelFetcher />
    </View>
  );
}
