import { View } from "reshaped";
import LoraGallery from "@/components/LoraGallery";

export default function LorasPage() {
  return (
    <View height="100vh" direction="column">
      <View padding={4} attributes={{ style: { flex: 1, overflowY: "auto" } }}>
        <LoraGallery />
      </View>
    </View>
  );
}
