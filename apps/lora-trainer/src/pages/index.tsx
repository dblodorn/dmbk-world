import { View } from "reshaped";
import ArenaChannelFetcher from "@/components/ArenaChannelFetcher";

export default function Home() {
  return (
    <View height="100vh" overflow="hidden">
      <ArenaChannelFetcher />
    </View>
  );
}
